import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { pool, tx } from '../../db.js';
import { config } from '../../config.js';
import { ApiError } from '../../lib/ApiError.js';
import { ASSISTANT_GUEST_LIMIT } from '@tm/shared/src/domain/assistant.js';
import { cleanReferencePhotos, REFERENCE_PHOTO_MAX_COUNT } from '@tm/shared/src/domain/referencePhoto.js';
import { isRental } from '@tm/shared/src/services/config.js';
import { storage } from '../../integrations/storage/index.js';

const decode = (value) => (typeof value === 'string' ? JSON.parse(value) : value);
export const visitorHash = (token) =>
  typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token)
    ? createHash('sha256').update(token).digest('hex')
    : null;
export const manilaDay = (at) => new Date(at + 8 * 3600000).toISOString().slice(0, 10);
const missing = () => new ApiError('NOT_FOUND', 'This assistant conversation is no longer available.');
const busy = () =>
  new ApiError('ASSISTANT_BUSY', 'An answer is still being prepared. Please wait and refresh the conversation.');
const editable = (conversation) => {
  if (conversation.submitted_ref)
    throw new ApiError(
      'INVALID_STATE',
      'This request was already submitted. Start a new reservation to make another request.'
    );
};
const photosOf = (conversation) => cleanReferencePhotos(decode(conversation.reference_photos) || []);
export const limitError = (guest) =>
  guest
    ? new ApiError('ASSISTANT_SIGN_IN_REQUIRED', 'Create an account or log in to continue asking questions.')
    : new ApiError(
        'RATE_LIMITED',
        'Your daily assistant allowance has been reached. Please try again tomorrow or message the admin.'
      );

export function createAssistantRepository({
  query = (...args) => pool.query(...args),
  transact = tx,
  settings = config.assistant,
  clock = Date.now,
  removePhoto = (key) => storage.remove(key)
} = {}) {
  const quota = (actor) => ({
    key: actor.customerId ? `c:${actor.customerId}:${manilaDay(clock())}` : `g:${actor.visitorHash}`,
    limit: actor.customerId ? settings.dailyLimit : ASSISTANT_GUEST_LIMIT,
    expires: clock() + (actor.customerId ? 3 * 86400000 : settings.visitorTtlMs)
  });
  async function ensureQuota(db, actor) {
    const q = quota(actor);
    await db.query('INSERT INTO assistant_allowances (id, expires_at) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = id', [
      q.key,
      q.expires
    ]);
    const [[row]] = await db.query('SELECT * FROM assistant_allowances WHERE id = ? FOR UPDATE', [q.key]);
    return { ...q, row };
  }
  async function removePhotos(photos) {
    await Promise.all(
      photos.map((photo) =>
        removePhoto(photo.key).catch((error) => console.error('[assistant-photo] Cleanup failed:', error.message))
      )
    );
  }
  async function writable(db, id, actor, revision) {
    const conversation = await owned(db, id, actor, true);
    editable(conversation);
    const q = await ensureQuota(db, actor);
    if (q.row.active_request && Number(q.row.lease_until) > clock()) throw busy();
    if (Number(conversation.draft_revision || 0) !== revision)
      throw new ApiError(
        'ASSISTANT_BUSY',
        'Your plan changed. Refresh the conversation before editing or submitting it.'
      );
    return conversation;
  }
  async function owned(db, id, actor, lock = false) {
    const [[row]] = await db.query(`SELECT * FROM assistant_conversations WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [
      id
    ]);
    if (
      !row ||
      Number(row.expires_at) <= clock() ||
      (row.customer_id
        ? row.customer_id !== actor.customerId
        : !actor.visitorHash || row.visitor_hash !== actor.visitorHash)
    )
      throw missing();
    if (!row.customer_id) {
      const [[guest]] = await db.query('SELECT expires_at FROM assistant_allowances WHERE id = ?', [
        `g:${actor.visitorHash}`
      ]);
      if (!guest || Number(guest.expires_at) <= clock()) throw missing();
    }
    return row;
  }
  function allowance(actor, row) {
    const q = quota(actor);
    const pending = Boolean(row?.active_request && Number(row?.lease_until) > clock());
    return {
      guest: !actor.customerId,
      limit: q.limit,
      used: Number(row?.used || 0),
      remaining: Math.max(0, q.limit - Number(row?.used || 0) - Number(pending)),
      pending
    };
  }
  const repo = {
    async open(actor, requestedId, { fresh = false } = {}) {
      return transact(async (db) => {
        let token;
        if (!actor.customerId) {
          const [[prior]] = actor.visitorHash
            ? await db.query('SELECT expires_at FROM assistant_allowances WHERE id = ?', [`g:${actor.visitorHash}`])
            : [[]];
          if (!prior || Number(prior.expires_at) <= clock()) {
            token = randomBytes(32).toString('base64url');
            actor = { visitorHash: visitorHash(token) };
          }
        }
        let row;
        if (requestedId && !fresh) {
          const [[candidate]] = await db.query('SELECT * FROM assistant_conversations WHERE id = ? FOR UPDATE', [
            requestedId
          ]);
          if (candidate && Number(candidate.expires_at) > clock()) {
            await owned(db, requestedId, actor);
            row = candidate;
          }
        }
        if (!row && !fresh) {
          const [rows] = actor.customerId
            ? await db.query(
                'SELECT * FROM assistant_conversations WHERE customer_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
                [actor.customerId, clock()]
              )
            : await db.query(
                'SELECT * FROM assistant_conversations WHERE visitor_hash = ? AND customer_id IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
                [actor.visitorHash, clock()]
              );
          row = rows[0];
        }
        if (!row) {
          row = {
            id: randomUUID(),
            customer_id: actor.customerId || null,
            visitor_hash: actor.visitorHash || null,
            expires_at: clock() + settings.conversationTtlMs
          };
          await db.query(
            'INSERT INTO assistant_conversations (id, visitor_hash, customer_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
            [row.id, row.visitor_hash, row.customer_id, clock(), row.expires_at]
          );
        } else if (!row.customer_id && actor.customerId) {
          // Claim requires both an authenticated customer and possession of the original visitor token.
          if (!actor.visitorHash || row.visitor_hash !== actor.visitorHash) throw missing();
          const [[guest]] = await db.query('SELECT * FROM assistant_allowances WHERE id = ? FOR UPDATE', [
            `g:${actor.visitorHash}`
          ]);
          if (
            !guest ||
            Number(guest.expires_at) <= clock() ||
            (guest.active_request && Number(guest.lease_until) > clock())
          )
            throw busy();
          await db.query('UPDATE assistant_conversations SET customer_id = ? WHERE id = ? AND customer_id IS NULL', [
            actor.customerId,
            row.id
          ]);
        }
        const q = await ensureQuota(db, actor);
        return {
          actor,
          conversationId: row.id,
          visitorToken: token,
          allowance: allowance(actor, q.row),
          expiresAt: Number(row.expires_at)
        };
      });
    },
    async read(actor, id) {
      const db = { query };
      const conversation = await owned(db, id, actor);
      const [rows] = await query(
        'SELECT id, request_id, user_text, source, status, response, created_at FROM assistant_turns WHERE conversation_id = ? ORDER BY created_at, id',
        [id]
      );
      const [[q]] = await query('SELECT * FROM assistant_allowances WHERE id = ?', [quota(actor).key]);
      return {
        conversationId: id,
        expiresAt: Number(conversation.expires_at),
        bookingDraft: conversation.booking_draft ? decode(conversation.booking_draft) : {},
        draftRevision: Number(conversation.draft_revision || 0),
        referencePhotos: photosOf(conversation).map(({ name, mime, size }, index) => ({ index, name, mime, size })),
        submittedRef: conversation.submitted_ref || null,
        allowance: allowance(actor, q),
        messages: rows.map((r) => ({
          id: r.id,
          requestId: r.request_id,
          text: r.user_text,
          source: r.source,
          status: r.status === 'pending' && !allowance(actor, q).pending ? 'failed' : r.status,
          response: r.response ? decode(r.response) : null,
          createdAt: Number(r.created_at)
        }))
      };
    },
    async begin(actor, conversationId, input) {
      return transact(async (db) => {
        const conversation = await owned(db, conversationId, actor, true);
        editable(conversation);
        const q = await ensureQuota(db, actor);
        const [[existing]] = await db.query(
          'SELECT * FROM assistant_turns WHERE conversation_id = ? AND request_id = ? FOR UPDATE',
          [conversationId, input.requestId]
        );
        if (existing && (existing.user_text !== input.text || existing.source !== input.source))
          throw new ApiError('INVALID', 'Use a new request identifier for a changed question.');
        if (existing?.status === 'completed') return { id: existing.id, replay: true };
        if (q.row.active_request && Number(q.row.lease_until) > clock()) throw busy();
        if (Number(q.row.used) >= q.limit) throw limitError(!actor.customerId);
        if (q.row.active_request)
          await db.query("UPDATE assistant_turns SET status = 'failed' WHERE id = ? AND status = 'pending'", [
            q.row.active_request
          ]);
        const id = existing?.id || randomUUID();
        if (existing)
          await db.query("UPDATE assistant_turns SET status = 'pending', quota_key = ?, response = NULL WHERE id = ?", [
            q.key,
            id
          ]);
        else
          await db.query(
            "INSERT INTO assistant_turns (id, conversation_id, request_id, quota_key, user_text, source, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
            [id, conversationId, input.requestId, q.key, input.text, input.source, clock()]
          );
        await db.query('UPDATE assistant_allowances SET active_request = ?, lease_until = ? WHERE id = ?', [
          id,
          clock() + 120000,
          q.key
        ]);
        const [history] = await db.query(
          "SELECT user_text, response FROM assistant_turns WHERE conversation_id = ? AND status = 'completed' ORDER BY created_at DESC, id DESC LIMIT 6",
          [conversationId]
        );
        return {
          id,
          bookingDraft: conversation.booking_draft ? decode(conversation.booking_draft) : {},
          history: history.reverse().flatMap((r) => [
            { role: 'user', content: r.user_text },
            { role: 'assistant', content: decode(r.response).answer }
          ])
        };
      });
    },
    async finish(id, response) {
      let removed = [];
      const finished = await transact(async (db) => {
        const [[prior]] = await db.query('SELECT quota_key, conversation_id FROM assistant_turns WHERE id = ?', [id]);
        if (!prior) return false;
        // All draft changes take the conversation lock before the allowance lock, matching begin/updateDraft.
        const [[conversation]] = await db.query('SELECT * FROM assistant_conversations WHERE id = ? FOR UPDATE', [
          prior.conversation_id
        ]);
        if (!conversation || conversation.submitted_ref) return false;
        const [[q]] = await db.query('SELECT * FROM assistant_allowances WHERE id = ? FOR UPDATE', [prior.quota_key]);
        const [[turn]] = await db.query('SELECT * FROM assistant_turns WHERE id = ? FOR UPDATE', [id]);
        if (!turn || turn.status !== 'pending') return false;
        if (q?.active_request !== id || Number(q.lease_until) <= clock()) return false;
        await db.query('UPDATE assistant_turns SET status = ?, response = ? WHERE id = ?', [
          response ? 'completed' : 'failed',
          response ? JSON.stringify(response) : null,
          id
        ]);
        if (response?.bookingDraft) {
          await db.query(
            `UPDATE assistant_conversations SET booking_draft = ?, draft_revision = draft_revision + 1${isRental(response.bookingDraft.serviceType) ? ', reference_photos = NULL' : ''} WHERE id = ?`,
            [JSON.stringify(response.bookingDraft), prior.conversation_id]
          );
          if (isRental(response.bookingDraft.serviceType)) removed = photosOf(conversation);
        }
        await db.query(
          'UPDATE assistant_allowances SET used = used + ?, active_request = NULL, lease_until = 0 WHERE id = ?',
          [response ? 1 : 0, turn.quota_key]
        );
        return true;
      });
      await removePhotos(removed);
      return finished;
    },
    async updateDraft(actor, id, draft, revision) {
      const removed = await transact(async (db) => {
        const conversation = await writable(db, id, actor, revision);
        if (typeof draft === 'function') draft = await draft(db, decode(conversation.booking_draft) || {});
        await db.query(
          `UPDATE assistant_conversations SET booking_draft = ?, draft_revision = draft_revision + 1${isRental(draft.serviceType) ? ', reference_photos = NULL' : ''} WHERE id = ?`,
          [JSON.stringify(draft), id]
        );
        return isRental(draft.serviceType) ? photosOf(conversation) : [];
      });
      await removePhotos(removed);
    },
    async referencePhoto(actor, id, index) {
      const conversation = await owned({ query }, id, actor);
      const photo = Number.isInteger(index) && index >= 0 ? photosOf(conversation)[index] : null;
      if (!photo) throw new ApiError('NOT_FOUND', 'This reference photo is no longer available.');
      return photo;
    },
    async updatePhotos(actor, id, revision, change) {
      return transact(async (db) => {
        const conversation = await writable(db, id, actor, revision);
        if (isRental(decode(conversation.booking_draft)?.serviceType))
          throw new ApiError('INVALID', 'Reference photos are for event styling. Choose a catering service first.');
        const next = await change(photosOf(conversation));
        if (
          !Array.isArray(next) ||
          next.length > REFERENCE_PHOTO_MAX_COUNT ||
          cleanReferencePhotos(next).length !== next.length
        )
          throw new ApiError('INVALID', `Upload up to ${REFERENCE_PHOTO_MAX_COUNT} valid reference photos.`);
        await db.query(
          'UPDATE assistant_conversations SET reference_photos = ?, draft_revision = draft_revision + 1 WHERE id = ?',
          [JSON.stringify(next), id]
        );
      });
    },
    async submit(actor, id, revision, create) {
      if (!actor.customerId) throw new ApiError('UNAUTHENTICATED', 'Sign in to submit your reservation request.');
      return transact(async (db) => {
        const conversation = await owned(db, id, actor, true);
        // Return the existing request even when the client's revision predates its submission.
        if (conversation.submitted_ref) return conversation.submitted_ref;
        await writable(db, id, actor, revision);
        const [[customer]] = await db.query('SELECT id, name FROM customers WHERE id = ?', [actor.customerId]);
        if (!customer) throw new ApiError('UNAUTHENTICATED', 'Sign in again to submit your reservation request.');
        const result = await create(db, decode(conversation.booking_draft) || {}, photosOf(conversation), customer);
        await db.query(
          'UPDATE assistant_conversations SET submitted_ref = ?, draft_revision = draft_revision + 1 WHERE id = ?',
          [result.ref, id]
        );
        return result.ref;
      });
    },
    async voiceAttempt(actor, id, messageId) {
      return transact(async (db) => {
        const conversation = await owned(db, id, actor, true);
        if (!messageId) editable(conversation);
        const q = await ensureQuota(db, actor);
        if (messageId) {
          const [[turn]] = await db.query(
            "SELECT * FROM assistant_turns WHERE id = ? AND conversation_id = ? AND status = 'completed' FOR UPDATE",
            [messageId, id]
          );
          if (!turn) throw missing();
          if (turn.speech_tries >= 2)
            throw new ApiError(
              'RATE_LIMITED',
              'Please read the answer on screen. Its voice retry limit has been reached.'
            );
          await db.query('UPDATE assistant_turns SET speech_tries = speech_tries + 1 WHERE id = ?', [messageId]);
          return decode(turn.response).answer;
        }
        if (q.row.used >= q.limit) throw limitError(!actor.customerId);
        if (q.row.active_request && q.row.lease_until > clock()) throw busy();
        if (q.row.voice_tries >= q.limit * 2)
          throw new ApiError(
            'RATE_LIMITED',
            'The voice recording allowance has been reached. You can still type your question.'
          );
        await db.query('UPDATE assistant_allowances SET voice_tries = voice_tries + 1 WHERE id = ?', [q.key]);
        return null;
      });
    },
    async beginExternal(actor) {
      return transact(async (db) => {
        const q = await ensureQuota(db, actor);
        if (q.row.active_request && Number(q.row.lease_until) > clock()) throw busy();
        if (Number(q.row.used) >= q.limit) throw limitError(!actor.customerId);
        const id = randomUUID();
        await db.query('UPDATE assistant_allowances SET active_request = ?, lease_until = ? WHERE id = ?', [
          id,
          clock() + 120000,
          q.key
        ]);
        return { id, quotaKey: q.key };
      });
    },
    async finishExternal(work, completed) {
      return transact(async (db) => {
        const [[q]] = await db.query('SELECT * FROM assistant_allowances WHERE id = ? FOR UPDATE', [work.quotaKey]);
        if (q?.active_request !== work.id || Number(q.lease_until) <= clock()) return false;
        await db.query(
          'UPDATE assistant_allowances SET used = used + ?, active_request = NULL, lease_until = 0 WHERE id = ?',
          [completed ? 1 : 0, work.quotaKey]
        );
        return true;
      });
    },
    async reserveSpend(kind, ownerKey, upperMicro) {
      if (!Number.isSafeInteger(upperMicro) || upperMicro < 1) throw new Error('Invalid assistant spend reservation.');
      return transact(async (db) => {
        const day = manilaDay(clock());
        const keys = [`d:${day}`, `m:${day.slice(0, 7)}`];
        const limits = [settings.dailyBudgetMicro, settings.monthlyBudgetMicro];
        for (const [i, key] of keys.entries()) {
          await db.query(
            'INSERT INTO assistant_spend (id, used_micro, created_at) VALUES (?, 0, ?) ON DUPLICATE KEY UPDATE id = id',
            [key, clock()]
          );
          const [[row]] = await db.query('SELECT used_micro FROM assistant_spend WHERE id = ? FOR UPDATE', [key]);
          if (!limits[i] || Number(row.used_micro) + upperMicro > limits[i])
            throw new ApiError(
              'RATE_LIMITED',
              'The assistant is taking a break. Please browse our packages or message the admin.'
            );
          await db.query('UPDATE assistant_spend SET used_micro = used_micro + ? WHERE id = ?', [upperMicro, key]);
        }
        const id = randomUUID();
        await db.query(
          "INSERT INTO assistant_usage (id, owner_key, kind, day_key, month_key, reserved_micro, charged_micro, outcome, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'reserved', ?)",
          [id, ownerKey, kind, keys[0], keys[1], upperMicro, upperMicro, clock()]
        );
        return id;
      });
    },
    async settleSpend(id, actualMicro, usage = {}) {
      return transact(async (db) => {
        const [[r]] = await db.query('SELECT * FROM assistant_usage WHERE id = ? FOR UPDATE', [id]);
        if (!r || r.outcome !== 'reserved') return;
        const known = Number.isSafeInteger(actualMicro) && actualMicro >= 0;
        const charged = known ? actualMicro : Number(r.reserved_micro);
        for (const key of [r.day_key, r.month_key])
          await db.query('UPDATE assistant_spend SET used_micro = GREATEST(0, used_micro + ?) WHERE id = ?', [
            charged - Number(r.reserved_micro),
            key
          ]);
        await db.query(
          'UPDATE assistant_usage SET charged_micro = ?, outcome = ?, input_tokens = ?, output_tokens = ? WHERE id = ?',
          [
            charged,
            known ? 'completed' : 'unknown',
            Number(usage.input_tokens || 0),
            Number(usage.output_tokens || 0),
            id
          ]
        );
      });
    },
    async cleanup() {
      // Allowances deliberately outlive transcripts; deleting an expired conversation never refills a trial.
      const expiredPhotos = await transact(async (db) => {
        const [expired] = await db.query(
          'SELECT * FROM assistant_conversations WHERE expires_at <= ? LIMIT 100 FOR UPDATE',
          [clock()]
        );
        for (const conversation of expired)
          await db.query('DELETE FROM assistant_conversations WHERE id = ?', [conversation.id]);
        return expired.filter((conversation) => !conversation.submitted_ref).flatMap(photosOf);
      });
      await removePhotos(expiredPhotos);
      await query('DELETE FROM assistant_allowances WHERE expires_at <= ? AND lease_until <= ? LIMIT 100', [
        clock(),
        clock()
      ]);
      await query('DELETE FROM assistant_usage WHERE created_at < ? LIMIT 200', [clock() - 90 * 86400000]);
      await query('DELETE FROM assistant_spend WHERE created_at < ? LIMIT 100', [clock() - 90 * 86400000]);
    }
  };
  return repo;
}
