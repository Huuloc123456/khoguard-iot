-- Manual only: backup and verify ownership first. This deletes M14 slots and every reservation.
-- Stop project backend; do not execute as part of normal setup or test.
DROP TABLE reservations;
DROP TABLE slots;
DELETE FROM schema_migrations WHERE version = '006_reservations';
