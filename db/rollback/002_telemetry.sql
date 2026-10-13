-- Manual only: backup and verify ownership first. This deletes M05 history/session state.
-- Stop project backend/publishers; do not execute as part of normal setup or test.
DROP TABLE telemetry;
DROP TABLE device_current;
DROP TABLE device_sessions;
DROP TABLE warehouse_stream;
DROP TABLE zone_settings;
DELETE FROM schema_migrations WHERE version = '002_telemetry';
