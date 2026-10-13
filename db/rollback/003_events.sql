-- Manual only: backup and verify ownership first. This deletes M08 event history and gap records.
-- Stop project backend/publishers; do not execute as part of normal setup or test.
DROP TABLE event_gaps;
DROP TABLE device_events;
DELETE FROM schema_migrations WHERE version = '003_events';
