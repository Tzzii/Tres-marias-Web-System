
const first = ([rows]) => rows[0] || null;

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

export async function findFeedbackRef(db, id) {
  const row = first(await db.query('SELECT id, ref FROM testimonials WHERE id = ?', [id]));
  return row && { id: row.id, ref: row.ref };
}

export async function findFeedbackIdFor(db, ref) {
  const row = first(await db.query('SELECT id FROM testimonials WHERE ref = ?', [ref]));
  return row ? row.id : null;
}

export async function countUnread(db) {
  const row = first(await db.query('SELECT COUNT(*) AS n FROM testimonials WHERE read_by_admin = 0'));
  return Number(row.n);
}


export async function lockFeedback(conn, id) {
  const row = first(
    await conn.query('SELECT id, ref, status, featured, flagged, archived FROM testimonials WHERE id = ? FOR UPDATE', [
      id
    ])
  );
  return (
    row && {
      id: row.id,
      ref: row.ref,
      status: row.status,
      featured: Boolean(row.featured),
      flagged: Boolean(row.flagged),
      archived: Boolean(row.archived)
    }
  );
}

export async function insertFeedback(conn, f) {
  await conn.query(
    `INSERT INTO testimonials (id, customer_id, ref, rating, cat_food, cat_service, cat_punctuality, cat_setup, body, created_at,
                               status, featured, flagged, flag_reason, archived, read_by_admin, reply_body, reply_at, reply_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'hidden', 0, 0, '', 0, 0, NULL, NULL, NULL)`,
    [
      f.id,
      f.customerId,
      f.ref,
      f.rating,
      f.categories.food,
      f.categories.service,
      f.categories.punctuality,
      f.categories.setup,
      f.body,
      f.createdAt
    ]
  );
}

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

export async function markAllRead(db) {
  const [result] = await db.query('UPDATE testimonials SET read_by_admin = 1 WHERE read_by_admin = 0');
  return result.affectedRows;
}

export async function deleteFeedback(conn, id) {
  await conn.query('DELETE FROM testimonials WHERE id = ?', [id]);
}
