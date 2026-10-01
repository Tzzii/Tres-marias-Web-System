/**
 * SQL for the dashboard and the reports (docs §7.1: the repo holds SQL only; the figures are worked out
 * by @tm/shared/src/domain/reports.js in reports.service.js). The reservations with their payments and
 * refunds come from findReservations() in reservations.repo.js, read exactly as the reservation pages read
 * them; this file adds the two short lists the figures look names up in.
 * Every function takes `db`: the pool, or a transaction's connection so all reads see one snapshot.
 */

/** Every customer's { id, name }: the names on today's events, waiting requests and outstanding balances. */
export async function findCustomerNames(db) {
  const [rows] = await db.query('SELECT id, name FROM customers ORDER BY id');
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

/**
 * Every package's { id, name }, hidden and archived ones too, in the catalogue's order (sort_order, then
 * id: the browser store's array order), so "Most booked packages" lists every package and keeps that
 * order for packages booked equally often.
 */
export async function findPackageNames(db) {
  const [rows] = await db.query('SELECT id, name FROM packages ORDER BY sort_order, id');
  return rows.map((row) => ({ id: row.id, name: row.name }));
}
