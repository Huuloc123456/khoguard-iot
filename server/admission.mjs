// M14 receiving rules. Percentages are compared as exact integers (count*100 vs limit*capacity); the UI's rounded percent decides nothing.
export const WARN_PCT = 85, LIMIT_PCT = 95;
export const RESERVATION_TTL_MS = 15 * 60 * 1000;
export const TEMPERATURE_CLASSES = ['ambient', 'chilled', 'frozen'];
const fail = () => { throw Object.assign(new Error('INVALID_ADMISSION'), { code: 'INVALID_ADMISSION' }); };

// The 95% ceiling is the safety buffer (5% of usable slots); it is not subtracted again from capacity.
export function capacityDecision({ capacity, occupied, reserved }) {
  const used = occupied + reserved, after = used + 1;
  if (capacity <= 0 || after * 100 > LIMIT_PCT * capacity) return { ok: false, code: 'CAPACITY_LIMIT', used, after };
  return { ok: true, used, after, warning: after * 100 >= WARN_PCT * capacity ? 'NEAR_CAPACITY' : null };
}
// Inbound pallets pass the staging area (zone D); at 95% it is congested and receiving stops.
export const stagingBlocked = ({ capacity, occupied, reserved }) => capacity <= 0 || (occupied + reserved) * 100 >= LIMIT_PCT * capacity;

// Best fit: smallest size, then smallest load rating, then id, so large/heavy slots stay free and the order is stable.
export function pickSlot(slots, request) {
  return slots.filter(s => s.temperature_class === request.temperature_class && s.size_class >= request.size_class && s.max_load_kg >= request.load_kg)
    .sort((a, b) => a.size_class - b.size_class || a.max_load_kg - b.max_load_kg || (a.id < b.id ? -1 : 1))[0] ?? null;
}

export function parseAdmission(raw) {
  let body;
  try { body = JSON.parse(raw); } catch { fail(); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join() !== 'load_kg,request_id,size_class,temperature_class') fail();
  const { request_id, temperature_class, size_class, load_kg } = body;
  if (typeof request_id !== 'string' || !/^[A-Za-z0-9:_-]{8,64}$/.test(request_id) || !TEMPERATURE_CLASSES.includes(temperature_class)) fail();
  if (!Number.isInteger(size_class) || size_class < 1 || size_class > 3 || !Number.isInteger(load_kg) || load_kg < 1 || load_kg > 5000) fail();
  return { request_id, temperature_class, size_class, load_kg };
}

// One final state per reservation. A pending reservation at or after expires_at is expired, whatever was asked.
export function reservationAction(reservation, action, now) {
  const target = action === 'confirm' ? 'confirmed' : 'cancelled';
  if (reservation.status === 'pending') return now.getTime() >= new Date(reservation.expires_at).getTime() ? { expire: true, code: 'RESERVATION_EXPIRED' } : { next: target };
  if (reservation.status === target) return { same: true };
  return { code: reservation.status === 'expired' ? 'RESERVATION_EXPIRED' : 'RESERVATION_FINAL' };
}
