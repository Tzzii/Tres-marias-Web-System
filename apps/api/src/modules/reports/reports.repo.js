
export async function findCustomerNames(db) {
  const [rows] = await db.query('SELECT id, name FROM customers ORDER BY id');
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

export async function findPackageNames(db) {
  const [rows] = await db.query('SELECT id, name FROM packages ORDER BY sort_order, id');
  return rows.map((row) => ({ id: row.id, name: row.name }));
}
