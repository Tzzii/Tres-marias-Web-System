/** Existing password hashes and customer records remain intact; Google-only accounts can have no password. */
export async function migrateGooglePasswords(conn) {
  let changed = 0;
  for (const table of ['customers', 'signup_requests']) {
    const [[column]] = await conn.query(
      `SELECT IS_NULLABLE AS nullable FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'password_hash'`,
      [table]
    );
    if (column && column.nullable !== 'YES') {
      await conn.query(`ALTER TABLE \`${table}\` MODIFY COLUMN password_hash VARCHAR(255) NULL`);
      changed++;
    }
  }
  return changed;
}
