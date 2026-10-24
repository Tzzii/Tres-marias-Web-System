import { pool } from '../../db.js';
import { toCustomer, findCustomerByEmail, insertCustomer } from './auth.repo.js';

export { findCustomerByEmail, insertCustomer };

export async function findGoogleCustomer(subject, conn = pool) {
  const [[row]] = await conn.query(
    `SELECT c.* FROM customer_google_accounts g JOIN customers c ON c.id = g.customer_id WHERE g.google_subject = ?`,
    [subject]
  );
  return toCustomer(row);
}

export async function findCustomerForUpdate(id, conn) {
  const [[row]] = await conn.query('SELECT * FROM customers WHERE id = ? FOR UPDATE', [id]);
  return toCustomer(row);
}

export async function linkGoogle(subject, customerId, conn) {
  await conn.query('INSERT INTO customer_google_accounts (google_subject, customer_id) VALUES (?, ?)', [
    subject,
    customerId
  ]);
}
