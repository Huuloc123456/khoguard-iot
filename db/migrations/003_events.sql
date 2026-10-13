CREATE TABLE device_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(32) NOT NULL,
  event_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
  boot_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
  session_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
  seq BIGINT UNSIGNED NOT NULL,
  zone_id VARCHAR(16) NOT NULL,
  door_id VARCHAR(16) NOT NULL,
  event_type ENUM('rfid','panic','door','command_rejected') NOT NULL,
  received_at DATETIME(3) NOT NULL,
  message JSON NOT NULL,
  UNIQUE KEY event_dedupe (device_id,event_id),
  KEY event_boot_seq (device_id,boot_id,seq),
  KEY event_recent (received_at,id),
  FOREIGN KEY (device_id) REFERENCES devices(id),
  FOREIGN KEY (zone_id) REFERENCES zones(id),
  FOREIGN KEY (door_id) REFERENCES doors(id),
  CHECK (seq <= 9007199254740991)
) ENGINE=InnoDB;
CREATE TABLE event_gaps (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(32) NOT NULL,
  boot_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
  from_seq BIGINT UNSIGNED NOT NULL,
  to_seq BIGINT UNSIGNED NOT NULL,
  detected_at DATETIME(3) NOT NULL,
  KEY gap_recent (detected_at,id),
  FOREIGN KEY (device_id) REFERENCES devices(id),
  CHECK (from_seq <= to_seq AND to_seq <= 9007199254740991)
) ENGINE=InnoDB
;
