export async function migrateOutsourcePartnerDeletion(conn) {
  const [[column]] = await conn.query(
    `SELECT IS_NULLABLE AS nullable FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'outsource_contracts' AND column_name = 'partner_id'`
  );
  if (!column) return false;
  const [[foreignKey]] = await conn.query(
    `SELECT CONSTRAINT_NAME AS name, DELETE_RULE AS deleteRule FROM information_schema.referential_constraints
     WHERE constraint_schema = DATABASE() AND table_name = 'outsource_contracts'
       AND constraint_name IN ('fk_outsource_contracts_partner', 'fk_outsource_contracts_partner_delete')`
  );
  if (column.nullable === 'YES' && foreignKey?.deleteRule === 'SET NULL') return false;
  await conn.query(`ALTER TABLE outsource_contracts
    ${foreignKey ? `DROP FOREIGN KEY \`${foreignKey.name}\`,` : ''}
    MODIFY COLUMN partner_id VARCHAR(40) NULL,
    ADD CONSTRAINT fk_outsource_contracts_partner_delete FOREIGN KEY (partner_id)
      REFERENCES outsource_partners (id) ON DELETE SET NULL`);
  return true;
}
