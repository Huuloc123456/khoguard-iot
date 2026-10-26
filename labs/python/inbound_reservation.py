"""Teaching example for the soft-reservation flow in Part 2, section 2.7.

This is a standalone lab exercise. The live KhoGuard backend keeps its
transactional reservation implementation in JavaScript and MySQL.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

CAPACITY_LIMIT = 0.95
RESERVATION_MINUTES = 15


@dataclass
class IncomingItem:
    temp_zone: str
    weight_kg: float
    volume_m3: float


@dataclass
class Slot:
    slot_id: str
    temp_zone: str
    max_weight_kg: float
    max_volume_m3: float
    status: str = "Empty"
    reserved_until: datetime | None = None


def get_available_slots(
    slots: list[Slot], item: IncomingItem, now: datetime
) -> list[Slot]:
    """Return compatible empty slots in stable, best-fit order."""
    for slot in slots:
        if slot.status == "Reserved" and slot.reserved_until and slot.reserved_until <= now:
            slot.status = "Empty"
            slot.reserved_until = None
    return sorted(
        (
            slot
            for slot in slots
            if slot.status == "Empty"
            and slot.temp_zone == item.temp_zone
            and slot.max_weight_kg >= item.weight_kg
            and slot.max_volume_m3 >= item.volume_m3
        ),
        key=lambda slot: (slot.max_volume_m3, slot.max_weight_kg, slot.slot_id),
    )


def validate_inbound_request(
    incoming_item: IncomingItem,
    slots: list[Slot],
    current_utilization: float,
    now: datetime | None = None,
) -> tuple[str, Slot | str]:
    """Accept and hold a suitable slot for 15 minutes, or return a reason."""
    if not 0 <= current_utilization <= 1:
        raise ValueError("current_utilization must be between 0 and 1")
    if incoming_item.weight_kg <= 0 or incoming_item.volume_m3 <= 0:
        raise ValueError("weight and volume must be positive")

    at = now or datetime.now(timezone.utc)
    available_slots = get_available_slots(slots, incoming_item, at)
    if current_utilization >= CAPACITY_LIMIT or not available_slots:
        return "REJECT", "Kho đã đạt ngưỡng tối đa hoặc không còn vị trí phù hợp."

    assigned_slot = available_slots[0]
    assigned_slot.status = "Reserved"
    assigned_slot.reserved_until = at + timedelta(minutes=RESERVATION_MINUTES)
    return "ACCEPT", assigned_slot


def demo() -> None:
    slots = [
        Slot("C-001", "frozen", 40, 1.0),
        Slot("C-002", "frozen", 100, 2.0),
        Slot("C-003", "chilled", 40, 1.0),
    ]
    item = IncomingItem("frozen", weight_kg=18, volume_m3=0.4)
    result, detail = validate_inbound_request(item, slots, current_utilization=0.80)
    if result == "ACCEPT":
        print(f"{result}: gán ô {detail.slot_id}")
        print(f"Giữ đến: {detail.reserved_until.isoformat()}")
    else:
        print(f"{result}: {detail}")

    result, detail = validate_inbound_request(item, slots, current_utilization=0.95)
    print(f"{result}: {detail if isinstance(detail, str) else detail.slot_id}")


if __name__ == "__main__":
    demo()
