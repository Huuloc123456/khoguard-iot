#pragma once

// Card reads come from two sources that share one path into the controller:
// - the MFRC522 reader at door D07 (Wokwi board-mfrc522; direction from the IN/OUT switch),
// - one Serial line "RFID D07|D08 <card> IN|OUT", kept for the scripted acceptance runs.
namespace kg {
namespace rfid {
// Starts SPI and the reader; a missing reader is logged and the Serial path keeps working.
void begin();
void poll();
}  // namespace rfid
}  // namespace kg
