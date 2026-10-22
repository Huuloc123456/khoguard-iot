-- Manual only: verify ownership first and stop the project backend. Also restore "node-simulator" for SIM-A01,
-- SIM-B01 and SIM-D01 in contracts/devices.json, otherwise readiness fails.
UPDATE devices SET source = 'node-simulator' WHERE id IN ('SIM-A01', 'SIM-B01', 'SIM-D01') AND source = 'wokwi';
DELETE FROM schema_migrations WHERE version = '007_device_sources';
