import { config } from '../src/config.js';
import { tx, closePool } from '../src/db.js';

// Targeted, repeatable catalog update. Keeps reservations, dish IDs and configured dessert prices.
try {
  if (!['localhost', '127.0.0.1', '::1'].includes(config.db.host) && !process.argv.includes('--live'))
    throw new Error('Use --live explicitly for a remote database.');
  await tx(async (conn) => {
    const [desserts] = await conn.query("SELECT id FROM addons WHERE id = 'add-dessert'");
    if (!desserts.length)
      await conn.query(
        "INSERT INTO addons (id, name, description, price, has_quantity, has_packages, archived, sort_order) VALUES ('add-dessert', 'Dessert', 'Your choice of dessert, with flavor and presentation requests. Priced separately in your quotation.', NULL, 0, 0, 0, (SELECT n FROM (SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM addons) AS orders))"
      );
    const [dishes] = await conn.query(
      "SELECT id, category FROM dishes WHERE LOWER(REPLACE(REPLACE(name, '-', ''), ' ', '')) = 'karekare' ORDER BY category = 'pork' DESC, sort_order, id FOR UPDATE"
    );
    if (dishes.length) {
      await conn.query("UPDATE dishes SET category = 'pork' WHERE id = ?", [dishes[0].id]);
      // If both catalogs already had it, retain the duplicate as an archived record.
      for (const duplicate of dishes.slice(1))
        await conn.query('UPDATE dishes SET archived = 1 WHERE id = ?', [duplicate.id]);
    }
  });
  console.log(
    'Dessert additional charge is available; Kare-Kare is under Pork. Existing bookings and prices are preserved.'
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
