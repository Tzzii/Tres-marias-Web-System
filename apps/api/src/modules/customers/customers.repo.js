
const FIELDS = 'id, name, email, mobile, company, created_at';

const toCustomer = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  mobile: row.mobile,
  company: row.company,
  createdAt: row.created_at
});

export async function findCustomers(db, { customerId } = {}) {
  const [rows] =
    customerId != null
      ? await db.query(`SELECT ${FIELDS} FROM customers WHERE id = ?`, [customerId])
      : await db.query(`SELECT ${FIELDS} FROM customers ORDER BY created_at, id`);
  return rows.map(toCustomer);
}

export async function lockCustomer(conn, customerId) {
  const [[row]] = await conn.query(`SELECT ${FIELDS} FROM customers WHERE id = ? FOR UPDATE`, [customerId]);
  return row ? toCustomer(row) : null;
}

export async function emailUsedByAnother(db, email, customerId) {
  const [rows] = await db.query('SELECT id FROM customers WHERE email = ? AND id <> ? LIMIT 1', [email, customerId]);
  return rows.length > 0;
}

export async function updateContact(conn, customerId, { email, mobile }) {
  await conn.query('UPDATE customers SET email = ?, mobile = ? WHERE id = ?', [email, mobile, customerId]);
}
