-- Manual only: backup and verify ownership first. This deletes M13 accounts, sessions, login audit and access audit.
-- Stop project backend; do not execute as part of normal setup or test.
DROP TABLE access_audit;
DROP TABLE access_cards;
DROP TABLE auth_audit;
DROP TABLE user_sessions;
DROP TABLE users;
DELETE FROM schema_migrations WHERE version = '005_access';
