/**
 * SQL for the admin's customer directory (docs §7.1: the repo holds SQL only; the rules are in
 * customers.service.js). A customer comes back with the fields the Customers page shows, by the
 * names the pages use: { id, name, email, mobile, company, createdAt }. The password hash, the
 * name parts and the sign-in data are never read here (they belong to the auth module).
 *
 * The bookings, payments and refunds behind a customer's figures come from findReservations() in
 * reservations.repo.js, so they are read exactly as the reservation pages read them.
 * Every function takes `db`: the pool, or a transaction's connection so reads and writes see and
 * lock the same rows.
 */

// The columns a directory entry needs
const FIELDS = 'id, name, email, mobile, company, created_at';

// customers row -> directory record
const toCustomer = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  mobile: row.mobile,
  company: row.company,
  createdAt: row.created_at
});

/**
 * Customers for the directory, by sign-up time (then id): every one, or the one with `customerId`
 * ([] when there is none). The id lookup ignores case and trailing spaces (the column's collation),
 * so callers compare the id they asked for with the one that comes back.
 */
export async function findCustomers(db, { customerId } = {}) {
  const [rows] = customerId != null
    ? await db.query(`SELECT ${FIELDS} FROM customers WHERE id = ?`, [customerId])
    : await db.query(`SELECT ${FIELDS} FROM customers ORDER BY created_at, id`);
  return rows.map(toCustomer);
}

/** The customer's directory record with its row locked until the transaction ends, or null. Callers compare the id. */
export async function lockCustomer(conn, customerId) {
  const [[row]] = await conn.query(`SELECT ${FIELDS} FROM customers WHERE id = ? FOR UPDATE`, [customerId]);
  return row ? toCustomer(row) : null;
}

/**
 * True when a customer other than `customerId` uses this email. Emails are stored lower-case; the
 * comparison also ignores accents (the column's collation), the same way the UNIQUE email index
 * compares them when the change is saved.
 */
export async function emailUsedByAnother(db, email, customerId) {
  const [rows] = await db.query('SELECT id FROM customers WHERE email = ? AND id <> ? LIMIT 1', [email, customerId]);
  return rows.length > 0;
}

/** Save the corrected email and mobile number. Another customer's email fails with ER_DUP_ENTRY (UNIQUE email). */
export async function updateContact(conn, customerId, { email, mobile }) {
  await conn.query('UPDATE customers SET email = ?, mobile = ? WHERE id = ?', [email, mobile, customerId]);
}
