/**
 * SQL for reviews (docs §7.1: the repo holds SQL only; the rules are in feedback.service.js). A review
 * comes back in the shape the pages use:
 *   { id, customerId, ref, rating, categories: { food, service, punctuality, setup }, body, createdAt,
 *     status, featured, flagged, flagReason, archived, readByAdmin, reply: { body, at, by } | null }
 * `categories` and `reply` are flattened into columns (schema.sql: cat_*, reply_*), the way the
 * seeder saves them and scripts/db-roundtrip.js reads them back.
 *
 * Every function takes `db`: the pool, or a transaction's connection so reads and writes see and
 * lock the same rows. Lock order for a write that also posts to the chat (the admin's reply): the
 * booking's row first (lockOwner in reservations.repo.js), then the review's row (lockFeedback), then
 * the chat thread, the order every other write keeps.
 */

// First row of a SELECT, or null
const first = ([rows]) => rows[0] || null;

// testimonials row -> review record
const toFeedback = (row) => ({
  id: row.id,
  customerId: row.customer_id,
  ref: row.ref,
  rating: row.rating,
  categories: { food: row.cat_food, service: row.cat_service, punctuality: row.cat_punctuality, setup: row.cat_setup },
  body: row.body,
  createdAt: row.created_at,
  status: row.status,
  featured: Boolean(row.featured),
  flagged: Boolean(row.flagged),
  flagReason: row.flag_reason,
  archived: Boolean(row.archived),
  readByAdmin: Boolean(row.read_by_admin),
  reply: row.reply_body === null ? null : { body: row.reply_body, at: row.reply_at, by: row.reply_by }
});

/* ============================ Reads ============================ */

/**
 * Reviews with the names the pages show: [{ feedback, customerName, customerEmail, customerMobile,
 * eventName, eventDate, occasion, guests, packageName }] ('' or 0 when the row is missing). Which ones:
 *   { customerId }   that customer's reviews
 *   { id }           one review ([] or one entry; the lookup ignores case, so callers compare the id)
 *   { published }    the public website's: published, not flagged, not archived, featured first
 *   nothing          every review
 * Newest first (created_at, then id), after the featured ones for `published`; `limit` caps how many.
 */
export async function findFeedbacks(db, { customerId, id, published = false, limit } = {}) {
  const conditions = [];
  const params = [];
  if (customerId != null) {
    conditions.push('t.customer_id = ?');
    params.push(customerId);
  }
  if (id != null) {
    conditions.push('t.id = ?');
    params.push(id);
  }
  if (published) conditions.push("t.status = 'published' AND t.archived = 0 AND t.flagged = 0");
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const order = published ? 't.featured DESC, t.created_at DESC, t.id' : 't.created_at DESC, t.id';
  if (limit != null) params.push(limit);
  const [rows] = await db.query(
    `SELECT t.*, c.name AS customer_name, c.email AS customer_email, c.mobile AS customer_mobile,
            r.event_name, r.date AS event_date, r.occasion, r.guests, p.name AS package_name
       FROM testimonials t
       LEFT JOIN customers c ON c.id = t.customer_id
       LEFT JOIN reservations r ON r.ref = t.ref
       LEFT JOIN packages p ON p.id = r.package_id
      ${where}
      ORDER BY ${order}${limit != null ? ' LIMIT ?' : ''}`,
    params
  );
  return rows.map((row) => ({
    feedback: toFeedback(row),
    customerName: row.customer_name ?? '',
    customerEmail: row.customer_email ?? '',
    customerMobile: row.customer_mobile ?? '',
    eventName: row.event_name ?? '',
    eventDate: row.event_date ?? '',
    occasion: row.occasion ?? '',
    guests: row.guests ?? 0,
    packageName: row.package_name ?? ''
  }));
}

/** The id and event of a review, { id, ref } as stored, or null (no lock: to find which booking to lock first). */
export async function findFeedbackRef(db, id) {
  const row = first(await db.query('SELECT id, ref FROM testimonials WHERE id = ?', [id]));
  return row && { id: row.id, ref: row.ref };
}

/** The id of the review left for this booking, or null. */
export async function findFeedbackIdFor(db, ref) {
  const row = first(await db.query('SELECT id FROM testimonials WHERE ref = ?', [ref]));
  return row ? row.id : null;
}

/** How many reviews the admin has not read yet (archived ones too). */
export async function countUnread(db) {
  const row = first(await db.query('SELECT COUNT(*) AS n FROM testimonials WHERE read_by_admin = 0'));
  return Number(row.n);
}

/* ============================ Writes ============================ */

/**
 * A review's moderation state with its row locked until the transaction ends, or null:
 * { id, ref, status, featured, flagged, archived }. Two admin actions on one review therefore run one
 * after the other, and each checks the state the other left. The id lookup ignores case, so callers
 * compare it. Only this table's row is locked (no joins), so the lock order above holds.
 */
export async function lockFeedback(conn, id) {
  const row = first(await conn.query('SELECT id, ref, status, featured, flagged, archived FROM testimonials WHERE id = ? FOR UPDATE', [id]));
  return row && { id: row.id, ref: row.ref, status: row.status, featured: Boolean(row.featured), flagged: Boolean(row.flagged), archived: Boolean(row.archived) };
}

/**
 * Save a new review: hidden from the website, not featured, flagged or archived, unread by the admin,
 * without a reply. A second review of the same booking fails with ER_DUP_ENTRY (UNIQUE ref).
 */
export async function insertFeedback(conn, f) {
  await conn.query(
    `INSERT INTO testimonials (id, customer_id, ref, rating, cat_food, cat_service, cat_punctuality, cat_setup, body, created_at,
                               status, featured, flagged, flag_reason, archived, read_by_admin, reply_body, reply_at, reply_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'hidden', 0, 0, '', 0, 0, NULL, NULL, NULL)`,
    [f.id, f.customerId, f.ref, f.rating, f.categories.food, f.categories.service, f.categories.punctuality, f.categories.setup, f.body, f.createdAt]
  );
}

// The fields updateFeedback() may change, each with its column(s) and how the value is stored.
// A fixed list, so a key from anywhere else can never become SQL.
const COLUMNS = {
  status: [['status', (v) => v]],
  featured: [['featured', Boolean]],
  flagged: [['flagged', Boolean]],
  flagReason: [['flag_reason', (v) => v]],
  archived: [['archived', Boolean]],
  readByAdmin: [['read_by_admin', Boolean]],
  reply: [
    ['reply_body', (v) => (v ? v.body : null)],
    ['reply_at', (v) => (v ? v.at : null)],
    ['reply_by', (v) => (v ? v.by : null)]
  ]
};

/** Change some of a review's fields, e.g. { status: 'hidden', featured: false, readByAdmin: true }. */
export async function updateFeedback(conn, id, changes) {
  const sets = [];
  const params = [];
  Object.entries(changes).forEach(([key, value]) => {
    if (!COLUMNS[key]) throw new Error(`updateFeedback: unknown field "${key}"`);
    COLUMNS[key].forEach(([column, store]) => {
      sets.push(`${column} = ?`);
      params.push(store(value));
    });
  });
  if (!sets.length) return;
  await conn.query(`UPDATE testimonials SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
}

/** Mark every review read by the admin. Returns how many were unread. */
export async function markAllRead(db) {
  const [result] = await db.query('UPDATE testimonials SET read_by_admin = 1 WHERE read_by_admin = 0');
  return result.affectedRows;
}

/** Delete a review for good (the only table rows are really deleted from; nothing references it). */
export async function deleteFeedback(conn, id) {
  await conn.query('DELETE FROM testimonials WHERE id = ?', [id]);
}
