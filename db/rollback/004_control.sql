-- Manual only: backup and verify ownership first. This deletes M10 command history and M11 alerts/ack audit.
-- Stop project backend/publishers; do not execute as part of normal setup or test.
DROP TABLE alert_acks;
DROP TABLE alerts;
DROP TABLE door_commands;
DELETE FROM schema_migrations WHERE version = '004_control';
