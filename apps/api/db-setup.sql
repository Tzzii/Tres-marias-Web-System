-- One-time setup of the Tres Marias database and its MySQL accounts.
--
-- Run this ONCE as root (MySQL Workbench, or: mysql -u root -p < apps/api/db-setup.sql).
-- Before running, replace both CHANGE_ME_... passwords with your own. Put the backend one in
-- apps/api/.env as DB_PASSWORD; never commit a real password to this file.
--
-- After this, `npm run db:reset` creates the tables (schema.sql) and `npm run db:ping` checks the connection.
-- This file only creates the database and accounts; it never touches tables or data.

-- One database for the whole system, in utf8mb4 so ₱, ñ, en-dashes and emoji are stored correctly
CREATE DATABASE IF NOT EXISTS tres_marias
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- The account the API uses: full rights on this database only, nothing else on the server.
-- 'localhost' also covers connections to 127.0.0.1 unless the server runs with skip_name_resolve;
-- if `npm run db:ping` then says access denied, run the same two lines again with '127.0.0.1'.
CREATE USER IF NOT EXISTS 'tres_marias'@'localhost' IDENTIFIED BY 'CHANGE_ME_backend_password';
GRANT ALL PRIVILEGES ON tres_marias.* TO 'tres_marias'@'localhost';

-- Optional: a read-only account for database tools (e.g. an MCP server or a report viewer).
-- It can look at every table but cannot change anything.
CREATE USER IF NOT EXISTS 'tm_mcp_readonly'@'localhost' IDENTIFIED BY 'CHANGE_ME_readonly_password';
GRANT SELECT ON tres_marias.* TO 'tm_mcp_readonly'@'localhost';

FLUSH PRIVILEGES;
