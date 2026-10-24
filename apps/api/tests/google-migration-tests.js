import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { migrateGooglePasswords } from '../scripts/lib/google-auth-migration.js';

test('Google password migration only changes nullability and is idempotent', async () => {
  const nullable = { customers: 'NO', signup_requests: 'NO' };
  const statements = [];
  const conn = {
    query: async (sql, values) => {
      if (sql.includes('information_schema.columns')) return [[{ nullable: nullable[values[0]] }]];
      const table = /ALTER TABLE `(customers|signup_requests)`/.exec(sql)?.[1];
      assert.ok(table, `Unexpected migration SQL: ${sql}`);
      assert.match(sql, /MODIFY COLUMN password_hash VARCHAR\(255\) NULL/);
      assert.doesNotMatch(sql, /DROP|DELETE|TRUNCATE/i);
      statements.push(sql);
      nullable[table] = 'YES';
      return [{ affectedRows: 0 }];
    }
  };
  assert.equal(await migrateGooglePasswords(conn), 2);
  assert.equal(await migrateGooglePasswords(conn), 0);
  assert.equal(statements.length, 2);
});

test('Google identity schema enforces unique subject and customer with cascade cleanup', async () => {
  const sql = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  const table = sql.match(/CREATE TABLE customer_google_accounts \([\s\S]*?\) ENGINE/);
  assert.ok(table);
  assert.match(table[0], /PRIMARY KEY \(google_subject\)/);
  assert.match(table[0], /UNIQUE KEY \w+ \(customer_id\)/);
  assert.match(table[0], /REFERENCES customers \(id\) ON DELETE CASCADE/);
});
