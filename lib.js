// Pure helpers, no DOM. Tested in tests/lib.test.mjs.
import { ARCHETYPES, DIALOGUE } from './dialogue.js';

/** Stable 32-bit FNV-1a hash. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Map each bus service number to a slot in the frozen character pool.
 * The slot depends only on the service number, never on the other buses at the stop,
 * so bus 96 is the same character everywhere. Two buses at one stop can share a character.
 */
export function assignPoolIndexes(serviceNos, poolSize) {
  const out = {};
  for (const no of serviceNos) out[no] = fnv1a(no) % poolSize;
  return out;
}

export function archetypeFor(serviceNo) {
  return ARCHETYPES[fnv1a('archetype:' + serviceNo) % ARCHETYPES.length];
}

/** Whole minutes until arrival; <= 0 means arriving. */
export function minutesAway(durationMs) {
  return Math.max(0, Math.floor(durationMs / 60000));
}

export function classifyForecast(text = '') {
  const t = text.toLowerCase();
  if (t.includes('thunder')) return 'storm';
  if (/rain|shower|drizzle/.test(t)) return 'rain';
  if (/haz|mist|fog/.test(t)) return 'hazy';
  if (/cloud|overcast|windy/.test(t)) return 'cloudy';
  return 'fair';
}

/** Nearest item to (lat, lng) by flat-earth distance; fine at Singapore's scale. */
export function nearest(items, lat, lng, getLat, getLng) {
  let best = null;
  let bestD = Infinity;
  for (const item of items) {
    const dLat = getLat(item) - lat;
    const dLng = (getLng(item) - lng) * Math.cos((lat * Math.PI) / 180);
    const d = dLat * dLat + dLng * dLng;
    if (d < bestD) {
      bestD = d;
      best = item;
    }
  }
  return best;
}

/** Which dialogue situation applies. Priority order is deliberate. */
export function situationKey({ mins, load, weather, monitored }) {
  if (mins <= 0) return 'arriving';
  if (load === 'LSD') return 'packed';
  if (weather === 'storm') return 'storm';
  if (weather === 'rain') return 'rain';
  if (weather === 'hazy') return 'hazy';
  if (load === 'SDA') return 'standing';
  if (!monitored) return 'noGps';
  if (mins <= 5) return 'soon';
  if (mins >= 15) return 'long';
  return 'wait';
}

export function pickLine(serviceNo, ctx) {
  const lines = DIALOGUE[archetypeFor(serviceNo)][situationKey(ctx)];
  return lines[fnv1a(serviceNo + ':' + situationKey(ctx)) % lines.length];
}

export const LOAD_LABEL = { SEA: 'Seats available', SDA: 'Standing available', LSD: 'Limited standing' };

/** Today's date in Singapore as YYYY-MM-DD. */
export function sgDate(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}

/** Add a date to the open log (one entry per day, sorted, no other data). */
export function logOpen(days, today) {
  return days.includes(today) ? days : [...days, today].sort();
}

// ---------- Stage 2: collection ----------

/** East/north offset in metres of (lat, lng) from the origin point. */
export function metersFrom(lat0, lng0, lat, lng) {
  const R = 6371000;
  const rad = Math.PI / 180;
  return { x: (lng - lng0) * rad * R * Math.cos(lat0 * rad), y: (lat - lat0) * rad * R };
}

/**
 * Add a character to the collection. Only called once the rider has confirmed boarding.
 * Boarding the same character again counts another ride.
 */
export function recordBoarded(collection, { id, svc }, today) {
  const prev = collection[id];
  if (!prev) {
    return { collection: { ...collection, [id]: { svc, first: today, last: today, rides: 1 } }, isNew: true };
  }
  return { collection: { ...collection, [id]: { ...prev, svc, last: today, rides: prev.rides + 1 } }, isNew: false };
}

/** Carry over only the earlier entries the owner marked as ridden; "seen" is not "boarded". */
export function migrateCollection(old) {
  const out = {};
  for (const [id, c] of Object.entries(old || {})) {
    if (c && c.rode === true) out[id] = { svc: c.svc, first: c.first, last: c.last || c.first, rides: 1 };
  }
  return out;
}

export function collectionStats(collection) {
  const entries = Object.values(collection);
  return { met: entries.length, rides: entries.reduce((n, c) => n + c.rides, 0) };
}

// ---------- Stage 3: scene ----------

/** Scene radius in metres from the distances of the buses we can place. */
export function sceneRadius(distances) {
  if (!distances.length) return 800;
  return Math.min(3000, Math.max(600, Math.max(...distances) * 1.2));
}

/** Distance between rings, chosen so at least two rings fit. */
export function ringStep(radius) {
  return [2000, 1000, 500, 200, 100].find((s) => radius / s >= 2) ?? 100;
}

// ---------- Review fixes: helpers extracted so the bugs can be unit tested ----------

/** Look up a stop by code. Returns the stop entry or null. Inherited keys like "constructor" are not stops. */
export function findStop(stops, code) {
  return code && Object.hasOwn(stops, code) ? stops[code] : null;
}

/**
 * Decides which stop's refresh is allowed to draw. A refresh asks for a ticket with begin(),
 * checks isCurrent() after every await, and calls end() when done.
 * Starting a refresh for another stop makes the earlier one stale; the same stop is not started twice.
 */
export function createRefreshGate() {
  let counter = 0;
  let active = null;
  return {
    begin(code) {
      if (active && active.code === code) return null;
      active = { id: ++counter, code };
      return active;
    },
    isCurrent(ticket) { return active === ticket; },
    cancel() { active = null; },
    end(ticket) { if (active === ticket) active = null; },
  };
}
