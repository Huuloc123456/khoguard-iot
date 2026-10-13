CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(32) NOT NULL,
  role ENUM('viewer','operator','admin') NOT NULL,
  password_hash VARCHAR(200) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY user_name (username)
) ENGINE=InnoDB;
CREATE TABLE user_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  KEY session_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE auth_audit (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(32) NOT NULL,
  action ENUM('login','login_failed','login_locked','logout','denied') NOT NULL,
  detail VARCHAR(64) NULL,
  at DATETIME(3) NOT NULL,
  KEY auth_audit_at (at)
) ENGINE=InnoDB;
CREATE TABLE access_cards (
  card_id VARCHAR(64) COLLATE utf8mb4_bin PRIMARY KEY,
  holder VARCHAR(64) NOT NULL,
  shift_code ENUM('DAY','NIGHT','ANY') NOT NULL,
  active BOOLEAN NOT NULL
) ENGINE=InnoDB;
INSERT INTO access_cards VALUES ('DEMO-017','Thẻ demo ca ngày','DAY',TRUE),('DEMO-018','Thẻ demo ca đêm','NIGHT',TRUE),('DEMO-999','Thẻ demo đã thu hồi','ANY',FALSE);
CREATE TABLE access_audit (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL,
  card_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
  door_id VARCHAR(16) NOT NULL,
  direction ENUM('in','out') NOT NULL,
  edge_result ENUM('accepted','duplicate','unauthorized') NOT NULL,
  shift_code ENUM('DAY','NIGHT') NOT NULL,
  shift_date DATE NOT NULL,
  decision ENUM('in_shift','out_of_shift','exit','unknown_card','revoked_card','edge_rejected','duplicate') NOT NULL,
  at DATETIME(3) NOT NULL,
  UNIQUE KEY access_event (event_id),
  KEY access_at (at),
  FOREIGN KEY (event_id) REFERENCES device_events(id),
  FOREIGN KEY (door_id) REFERENCES doors(id)
) ENGINE=InnoDB
