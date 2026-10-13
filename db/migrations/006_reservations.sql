CREATE TABLE slots (
  id VARCHAR(16) PRIMARY KEY,
  zone_id VARCHAR(16) NOT NULL,
  temperature_class ENUM('ambient','chilled','frozen') NOT NULL,
  size_class TINYINT UNSIGNED NOT NULL,
  max_load_kg SMALLINT UNSIGNED NOT NULL,
  staging BOOLEAN NOT NULL,
  status ENUM('available','occupied','defrost') NOT NULL,
  occupancy_source ENUM('demo-seed','reservation') NULL,
  KEY slot_fit (temperature_class, status, size_class, max_load_kg),
  FOREIGN KEY (zone_id) REFERENCES zones(id),
  CHECK (size_class BETWEEN 1 AND 3)
) ENGINE=InnoDB;
INSERT INTO slots (id,zone_id,temperature_class,size_class,max_load_kg,staging,status,occupancy_source)
WITH RECURSIVE seq (n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 100)
SELECT CONCAT(s.zone_id,'-',LPAD(seq.n,3,'0')), s.zone_id,
  CASE s.zone_id WHEN 'B' THEN 'chilled' WHEN 'C' THEN 'frozen' ELSE 'ambient' END,
  1 + MOD(seq.n,3), 500 * (1 + MOD(seq.n,3)), s.zone_id = 'D',
  CASE WHEN s.zone_id = 'C' AND seq.n > 78 THEN 'defrost'
    WHEN seq.n <= CASE s.zone_id WHEN 'A' THEN 84 WHEN 'B' THEN 64 WHEN 'C' THEN 60 ELSE 32 END THEN 'occupied' ELSE 'available' END,
  CASE WHEN seq.n <= CASE s.zone_id WHEN 'A' THEN 84 WHEN 'B' THEN 64 WHEN 'C' THEN 60 ELSE 32 END THEN 'demo-seed' END
FROM zone_settings s JOIN seq ON seq.n <= s.capacity;
CREATE TABLE reservations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
  slot_id VARCHAR(16) NOT NULL,
  temperature_class ENUM('ambient','chilled','frozen') NOT NULL,
  size_class TINYINT UNSIGNED NOT NULL,
  load_kg SMALLINT UNSIGNED NOT NULL,
  status ENUM('pending','confirmed','cancelled','expired') NOT NULL,
  requested_by VARCHAR(32) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  finished_at DATETIME(3) NULL,
  finished_by VARCHAR(32) NULL,
  active_slot VARCHAR(16) AS (CASE WHEN status = 'pending' THEN slot_id END) STORED,
  UNIQUE KEY reservation_request (request_id),
  UNIQUE KEY reservation_active_slot (active_slot),
  KEY reservation_expiry (status, expires_at),
  FOREIGN KEY (slot_id) REFERENCES slots(id),
  CHECK (expires_at > created_at)
) ENGINE=InnoDB
