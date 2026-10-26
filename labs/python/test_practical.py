"""Small checks for the standalone Python lab exercises."""

import unittest
from datetime import datetime, timedelta, timezone

import app as gpio_app
from gpio_sim import GPIO
from inbound_reservation import IncomingItem, Slot, validate_inbound_request


class GPIOLabTests(unittest.TestCase):
    def setUp(self):
        gpio_app.configure_gpio()
        self.client = gpio_app.app.test_client()

    def test_led_button_and_pwm_routes(self):
        self.assertEqual(self.client.get("/").status_code, 200)

        response = self.client.post("/led/green/on")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(GPIO.input(26), GPIO.HIGH)

        response = self.client.post("/button/press")
        self.assertEqual(response.status_code, 302)
        state = self.client.get("/api/state").get_json()
        self.assertEqual(state["pins"]["13"]["value"], GPIO.HIGH)
        self.assertEqual(state["event_counts"]["17"], 1)

        response = self.client.post("/pwm", data={"duty_cycle": "75"})
        self.assertEqual(response.status_code, 302)
        self.assertEqual(GPIO.snapshot()["pwm"]["18"]["duty_cycle"], 75.0)

    def test_rejects_invalid_led_and_pwm(self):
        self.assertEqual(self.client.post("/led/blue/on").status_code, 404)
        self.assertEqual(self.client.post("/pwm", data={"duty_cycle": "101"}).status_code, 400)


class ReservationLabTests(unittest.TestCase):
    def test_reserves_compatible_slot_and_rejects_at_capacity_limit(self):
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        slots = [Slot("F-01", "frozen", 20, 1.0)]
        item = IncomingItem("frozen", 10, 0.5)

        result, slot = validate_inbound_request(item, slots, 0.94, now)
        self.assertEqual(result, "ACCEPT")
        self.assertEqual(slot.reserved_until, now + timedelta(minutes=15))

        result, _ = validate_inbound_request(item, slots, 0.95, now)
        self.assertEqual(result, "REJECT")

    def test_expired_reservation_is_released(self):
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        slot = Slot("F-01", "frozen", 20, 1.0, "Reserved", now)
        result, assigned = validate_inbound_request(
            IncomingItem("frozen", 10, 0.5), [slot], 0.5, now
        )
        self.assertEqual(result, "ACCEPT")
        self.assertIs(assigned, slot)
        self.assertEqual(slot.reserved_until, now + timedelta(minutes=15))


if __name__ == "__main__":
    unittest.main()
