import { randomUUID } from 'node:crypto';
import { pool, tx } from '../../db.js';
import { config } from '../../config.js';
import { manilaDay } from './assistant.repo.js';

export const AI_LIMITS = Object.freeze({ globalConcurrent: 3, accountPerMinute: 6, ipPerMinute: 12 });
const FIVE_MINUTES = 300000;

export function deriveAlerts({ spending, recent }) {
  const alerts = [];
  for (const [period, value] of Object.entries(spending)) {
    if (value.limitCents > 0 && value.usedCents >= value.limitCents * 0.8) {
      const capped = value.usedCents >= value.limitCents;
      alerts.push({
        code: `${period}-budget-${capped ? 'cap' : 'warning'}`,
        severity: capped ? 'error' : 'warning',
        message: `${period === 'daily' ? 'Daily' : 'Monthly'} AI spending has reached ${capped ? 'the configured cap' : '80% of its configured limit'}.`
      });
    }
  }
  if (recent.unknownFailures > 0 && recent.unknownFailures < 5)
    alerts.push({
      code: 'provider-uncertainty',
      severity: 'warning',
      message:
        'A recent provider request had an uncertain outcome. Its spending reservation was retained; check provider usage before retrying repeatedly.'
    });
  if (recent.unknownFailures >= 5)
    alerts.push({
      code: 'provider-circuit',
      severity: 'error',
      message:
        'AI requests paused: at least five provider calls have uncertain outcomes in the last five minutes. New calls resume when this window clears.'
    });
  if (recent.requests >= 40)
    alerts.push({
      code: 'request-spike',
      severity: 'warning',
      message:
        'Abnormal AI traffic: at least 40 paid-request attempts in the last five minutes. Rate and concurrency limits remain active.'
    });
  return alerts;
}

export function createAISafetyRepository({
  transact = tx,
  query = (...args) => pool.query(...args),
  settings = config.assistant,
  clock = Date.now,
  logger = console.warn
} = {}) {
  return {
    async admit({ kind, ipKey, actorKey, signedIn }) {
      // Count denied attempts too. Return denial from the transaction, then reject at transport.
      // This stable mutex serializes admission across API workers, not just one process.
      return transact(async (db) => {
        await db.query(
          "INSERT INTO ai_guard_windows (id, used, expires_at) VALUES ('mutex', 0, 9223372036854775807) ON DUPLICATE KEY UPDATE id = id"
        );
        await db.query("SELECT used FROM ai_guard_windows WHERE id = 'mutex' FOR UPDATE");
        const now = clock(),
          minute = Math.floor(now / 60000),
          day = manilaDay(now);
        await db.query('DELETE FROM ai_guard_leases WHERE expires_at <= ?', [now]);
        const paid = kind === 'paid';
        const perMinute = paid ? AI_LIMITS.ipPerMinute : kind === 'upload' ? 5 : 8;
        const actorLimit = paid ? AI_LIMITS.accountPerMinute : kind === 'upload' ? 5 : 8;
        const windows = [
          [`minute:${kind}:${minute}`, paid ? 60 : 40, now + FIVE_MINUTES],
          [`ip:${kind}:${minute}:${ipKey}`, perMinute, now + FIVE_MINUTES],
          [`actor:${kind}:${minute}:${actorKey}`, actorLimit, now + FIVE_MINUTES],
          [`day-ip:${kind}:${day}:${ipKey}`, paid ? 200 : kind === 'upload' ? 30 : 100, now + 2 * 86400000],
          [
            `day-actor:${kind}:${day}:${actorKey}`,
            paid ? (signedIn ? settings.dailyLimit * 6 : 12) : kind === 'upload' ? 20 : 100,
            now + 2 * 86400000
          ]
        ];
        let allowed = true;
        for (const [id, limit, expires] of windows) {
          await db.query('INSERT IGNORE INTO ai_guard_windows (id, used, expires_at) VALUES (?, 0, ?)', [id, expires]);
          await db.query('UPDATE ai_guard_windows SET used = used + 1 WHERE id = ?', [id]);
          const [[row]] = await db.query('SELECT used FROM ai_guard_windows WHERE id = ?', [id]);
          if (Number(row.used) > limit) allowed = false;
        }
        await db.query("DELETE FROM ai_guard_windows WHERE expires_at < ? AND id <> 'mutex' LIMIT 50", [now]);
        if (!allowed) return { allowed: false, reason: 'attempt-limit' };
        if (paid) {
          const [[failures]] = await db.query(
            "SELECT COUNT(*) AS total FROM assistant_usage WHERE outcome = 'unknown' AND created_at >= ?",
            [now - FIVE_MINUTES]
          );
          if (Number(failures.total) >= 5) return { allowed: false, reason: 'provider-circuit' };
        }
        if (kind === 'session') return { allowed: true };
        const [[active]] = await db.query(
          'SELECT COUNT(*) AS total, COALESCE(SUM(actor_key = ?), 0) AS owned FROM ai_guard_leases WHERE kind = ?',
          [actorKey, kind]
        );
        if (Number(active.total) >= (paid ? AI_LIMITS.globalConcurrent : 2) || Number(active.owned) >= 1)
          return { allowed: false, reason: 'concurrency' };
        const lease = randomUUID();
        await db.query('INSERT INTO ai_guard_leases (id, kind, actor_key, expires_at) VALUES (?, ?, ?, ?)', [
          lease,
          kind,
          actorKey,
          now + 120000
        ]);
        return { allowed: true, lease };
      });
    },
    async release(lease) {
      await query('DELETE FROM ai_guard_leases WHERE id = ?', [lease]);
    },
    async snapshot() {
      const now = clock(),
        day = manilaDay(now);
      const [spend] = await query('SELECT id, used_micro FROM assistant_spend WHERE id IN (?, ?)', [
        `d:${day}`,
        `m:${day.slice(0, 7)}`
      ]);
      const [[usage]] = await query(
        "SELECT COUNT(*) AS total FROM assistant_usage WHERE outcome = 'unknown' AND created_at >= ?",
        [now - FIVE_MINUTES]
      );
      const [[traffic]] = await query(
        "SELECT COALESCE(SUM(used), 0) AS total FROM ai_guard_windows WHERE id LIKE 'minute:paid:%' AND expires_at > ?",
        [now]
      );
      const bucket = (id, limit) => ({
        usedCents: Number(spend.find((row) => row.id === id)?.used_micro || 0) / 10000,
        limitCents: limit / 10000
      });
      const result = {
        model: settings.model,
        enabled: settings.enabled,
        available: Boolean(
          settings.enabled && settings.apiKey && settings.dailyBudgetMicro > 0 && settings.monthlyBudgetMicro > 0
        ),
        spending: {
          daily: bucket(`d:${day}`, settings.dailyBudgetMicro),
          monthly: bucket(`m:${day.slice(0, 7)}`, settings.monthlyBudgetMicro)
        },
        recent: { requests: Number(traffic.total), unknownFailures: Number(usage.total) },
        limits: AI_LIMITS
      };
      return { ...result, alerts: deriveAlerts(result) };
    },
    async report() {
      const snapshot = await this.snapshot(),
        day = manilaDay(clock());
      for (const alert of snapshot.alerts) {
        const id = `${day}:${alert.code}`;
        const [result] = await query(
          'INSERT IGNORE INTO ai_usage_alerts (id, code, severity, message, created_at) VALUES (?, ?, ?, ?, ?)',
          [id, alert.code, alert.severity, alert.message, clock()]
        );
        if (result.affectedRows) logger('[ai-usage-alert]', JSON.stringify(alert));
      }
      await query('DELETE FROM ai_usage_alerts WHERE created_at < ? LIMIT 50', [clock() - 90 * 86400000]);
    }
  };
}
