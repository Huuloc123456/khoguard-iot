-- Only run through scripts/provision-mysql.mjs after its collision checks.
-- Password tokens are replaced with randomly generated hex, never user input.
CREATE DATABASE `khoguard_demo` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `khoguard_demo`.`infra_meta` (
  meta_key VARCHAR(64) PRIMARY KEY,
  meta_value VARCHAR(128) NOT NULL
) ENGINE=InnoDB;
CREATE USER 'khoguard_runtime'@'localhost' IDENTIFIED BY '@RUNTIME_PASSWORD@';
CREATE USER 'khoguard_migrate'@'localhost' IDENTIFIED BY '@MIGRATION_PASSWORD@';
GRANT SELECT, INSERT, UPDATE, DELETE ON `khoguard_demo`.* TO 'khoguard_runtime'@'localhost';
GRANT CREATE, ALTER, DROP, INDEX, REFERENCES, SELECT, INSERT, UPDATE, DELETE ON `khoguard_demo`.* TO 'khoguard_migrate'@'localhost';
