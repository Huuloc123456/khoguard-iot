-- DEC-043: zones A, B and D now come from Wokwi zone-node firmware. Device IDs, accounts and history are unchanged.
-- (The migration runner splits on semicolons, so comments here must not contain one.)
UPDATE devices SET source = 'wokwi' WHERE id IN ('SIM-A01', 'SIM-B01', 'SIM-D01') AND source = 'node-simulator';
