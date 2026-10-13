-- Manual reversal only after ownership verification and a database backup.
-- Deletes inventory data, keeps M02 infra_meta and all accounts intact.
USE khoguard_demo;
DROP TABLE doors;
DROP TABLE devices;
DROP TABLE zones;
DROP TABLE warehouses;
DELETE FROM infra_meta WHERE meta_key = 'seed_registry_v1';
DELETE FROM schema_migrations WHERE version = '001_inventory';
