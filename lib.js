// Pure helpers, no DOM. Tested in tests/lib.test.mjs.
import { ARCHETYPES, DIALOGUE } from './dialogue.js';
import { isRepeatBoarding } from './fixes/double-board.js';

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
 * Boarding the same character again counts another ride, unless it is within 5 minutes of the last one (double tap).
 * Returns { collection, isNew, ignored }; when ignored, the collection is returned unchanged.
 */
export function recordBoarded(collection, { id, svc }, today, nowMs = Date.now()) {
  const prev = collection[id];
  if (!prev) {
    return { collection: { ...collection, [id]: { svc, first: today, last: today, rides: 1, lastAt: nowMs } }, isNew: true, ignored: false };
  }
  if (isRepeatBoarding(prev, nowMs)) return { collection, isNew: false, ignored: true };
  return { collection: { ...collection, [id]: { ...prev, svc, last: today, rides: prev.rides + 1, lastAt: nowMs } }, isNew: false, ignored: false };
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

// ---------- P2-3 to P2-7 ----------

/** Search stops. Rank: exact name, name prefix, code prefix, name contains, road contains; ties by code. */
export function findStops(stops, query, limit = 25) {
  const q = String(query ?? '').trim().toLowerCase();
  if (q.length < 2) return { codes: [], total: 0 };
  const hits = [];
  for (const [code, [, , name, road]] of Object.entries(stops)) {
    const n = name.toLowerCase();
    let rank = -1;
    if (n === q) rank = 0;
    else if (n.startsWith(q)) rank = 1;
    else if (code.startsWith(q)) rank = 2;
    else if (n.includes(q)) rank = 3;
    else if (road.toLowerCase().includes(q)) rank = 4;
    if (rank >= 0) hits.push([rank, code]);
  }
  hits.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return { codes: hits.slice(0, limit).map((h) => h[1]), total: hits.length };
}

/** Re-selecting the open stop replaces the history entry; anything else pushes one. */
export function historyAction(currentStopCode, nextCode) {
  return currentStopCode != null && currentStopCode === nextCode ? 'replace' : 'push';
}

/** Collected characters first (oldest first-date first, ties in pool order), then locked ones in pool order. */
export function orderPool(pool, collection) {
  const owned = [];
  const locked = [];
  pool.forEach((c, i) => (collection[c.id] ? owned.push([c, i]) : locked.push(c)));
  owned.sort((a, b) => {
    const fa = collection[a[0].id].first;
    const fb = collection[b[0].id].first;
    return fa < fb ? -1 : fa > fb ? 1 : a[1] - b[1];
  });
  return [...owned.map((o) => o[0]), ...locked];
}

/** Log a day of use. Only a stop view counts; the home page does not. */
export function recordOpen(days, today, view) {
  return view === 'stop' ? logOpen(days, today) : days;
}
