import { pool, tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';

export const PRESENCE_LEASE_MS = 90000;

export async function getAdminPresence(db = pool, at = Date.now()) {
  const [[row]] = await db.query(
    `
    SELECT MAX(CASE WHEN a.session_id = p.session_id THEN p.online_until ELSE p.last_seen_at END) AS ended_at,
           MAX(CASE WHEN a.session_id = p.session_id AND p.online_until > ? THEN 1 ELSE 0 END) AS online
      FROM admin_presence p JOIN admins a ON a.id = p.admin_id`,
    [at]
  );
  const online = Boolean(Number(row.online));
  return {
    online,
    offlineSince: online || row.ended_at == null ? null : Math.min(at, Number(row.ended_at)),
    serverTime: at
  };
}

export async function updateAdminPresence(
  user,
  sessionId,
  { clientId, sequence, active },
  { transact = tx, at = Date.now() } = {}
) {
  return transact(async (conn) => {
    // Serialize heartbeat and close requests, and reject a session replaced during authentication.
    const [[admin]] = await conn.query('SELECT session_id FROM admins WHERE id = ? FOR UPDATE', [user.id]);
    if (!admin || admin.session_id !== sessionId) throw new ApiError('UNAUTHENTICATED', 'Please sign in again.');
    const [[current]] = await conn.query('SELECT * FROM admin_presence WHERE client_id = ? FOR UPDATE', [clientId]);
    if (current && (current.admin_id !== user.id || current.session_id !== sessionId))
      throw new ApiError('FORBIDDEN', 'Presence connection does not belong to this session.');
    if (!current || sequence > Number(current.sequence_no)) {
      const until = active ? Math.min(at + PRESENCE_LEASE_MS, user.exp * 1000) : at;
      // Closing an unknown connection records no activity. A delayed heartbeat cannot revive it.
      const seen = active ? at : Number(current?.last_seen_at || at);
      await conn.query(
        `INSERT INTO admin_presence (client_id, admin_id, session_id, sequence_no, last_seen_at, online_until)
        VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE sequence_no = VALUES(sequence_no),
        last_seen_at = VALUES(last_seen_at), online_until = VALUES(online_until)`,
        [clientId, user.id, sessionId, sequence, seen, until]
      );
    }
    return { ok: true };
  });
}
