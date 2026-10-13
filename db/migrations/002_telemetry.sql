CREATE TABLE zone_settings (
  zone_id VARCHAR(16) PRIMARY KEY,
  temperature_min DOUBLE NOT NULL,
  temperature_max DOUBLE NOT NULL,
  capacity INT UNSIGNED NOT NULL,
  FOREIGN KEY (zone_id) REFERENCES zones(id),
  CHECK (temperature_min >= -100 AND temperature_max <= 100 AND temperature_min <= temperature_max),
  CHECK (capacity <= 100000)
) ENGINE=InnoDB;
INSERT INTO zone_settings VALUES ('A',18,30,100),('B',2,8,80),('C',-22,-16,80),('D',18,28,48);
CREATE TABLE warehouse_stream (
  warehouse_id VARCHAR(16) PRIMARY KEY,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  CHECK (revision <= 9007199254740991)
) ENGINE=InnoDB;
INSERT INTO warehouse_stream (warehouse_id) VALUES ('WH01');
CREATE TABLE device_sessions (
  device_id VARCHAR(32) NOT NULL,
  boot_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
  session_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
  retired BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (device_id,boot_id,session_id),
  FOREIGN KEY (device_id) REFERENCES devices(id),
  CHECK (retired IN (0,1))
) ENGINE=InnoDB;
CREATE TABLE device_current (
  device_id VARCHAR(32) PRIMARY KEY,
  boot_id VARCHAR(64) COLLATE utf8mb4_bin NULL,
  session_id VARCHAR(64) COLLATE utf8mb4_bin NULL,
  state ENUM('online','offline','unknown') NOT NULL DEFAULT 'unknown',
  seq BIGINT UNSIGNED NULL,
  uptime_ms BIGINT UNSIGNED NULL,
  controller_revision BIGINT UNSIGNED NULL,
  message JSON NULL,
  received_at DATETIME(3) NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id),
  CHECK (seq <= 9007199254740991 AND uptime_ms <= 9007199254740991 AND controller_revision <= 9007199254740991)
) ENGINE=InnoDB;
INSERT INTO device_current (device_id) SELECT id FROM devices;
CREATE TABLE telemetry (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(32) NOT NULL,
  boot_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
  seq BIGINT UNSIGNED NOT NULL,
  received_at DATETIME(3) NOT NULL,
  message JSON NOT NULL,
  UNIQUE KEY telemetry_dedupe (device_id,boot_id,seq),
  KEY telemetry_history (device_id,received_at,id),
  FOREIGN KEY (device_id) REFERENCES devices(id),
  CHECK (seq <= 9007199254740991)
) ENGINE=InnoDB;
