
CREATE DATABASE IF NOT EXISTS tres_marias
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'tres_marias'@'localhost' IDENTIFIED BY 'CHANGE_ME_backend_password';
GRANT ALL PRIVILEGES ON tres_marias.* TO 'tres_marias'@'localhost';

CREATE USER IF NOT EXISTS 'tm_mcp_readonly'@'localhost' IDENTIFIED BY 'CHANGE_ME_readonly_password';
GRANT SELECT ON tres_marias.* TO 'tm_mcp_readonly'@'localhost';

FLUSH PRIVILEGES;
