CREATE TABLE warehouses (
  id VARCHAR(16) PRIMARY KEY,
  name VARCHAR(100) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE zones (
  id VARCHAR(16) PRIMARY KEY,
  warehouse_id VARCHAR(16) NOT NULL,
  name VARCHAR(100) NOT NULL,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
) ENGINE=InnoDB;
CREATE TABLE devices (
  id VARCHAR(32) PRIMARY KEY,
  zone_id VARCHAR(16) NOT NULL,
  source ENUM('wokwi','node-simulator') NOT NULL,
  measures_environment BOOLEAN NOT NULL,
  measures_occupancy BOOLEAN NOT NULL,
  UNIQUE KEY device_zone (id, zone_id),
  FOREIGN KEY (zone_id) REFERENCES zones(id),
  CHECK (measures_environment IN (0,1)),
  CHECK (measures_occupancy IN (0,1))
) ENGINE=InnoDB;
CREATE TABLE doors (
  id VARCHAR(16) PRIMARY KEY,
  zone_id VARCHAR(16) NOT NULL,
  device_id VARCHAR(32) NOT NULL,
  FOREIGN KEY (device_id, zone_id) REFERENCES devices(id, zone_id)
) ENGINE=InnoDB;
