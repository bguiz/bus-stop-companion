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

const naturalCompare = (a, b) => a.localeCompare(b, 'en', { numeric: true });

/**
 * Map each bus service number to an index in the frozen pool.
 * Same number gives the same index; if two services at one stop collide,
 * the later one (in natural order) takes the next free slot. Deterministic per stop.
 */
export function assignPoolIndexes(serviceNos, poolSize) {
  const out = {};
  const used = new Set();
  for (const no of [...serviceNos].sort(naturalCompare)) {
    let i = fnv1a(no) % poolSize;
    for (let guard = 0; used.has(i) && guard < poolSize; guard++) i = (i + 1) % poolSize;
    used.add(i);
    out[no] = i;
  }
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
 * Record characters seen today. `days` counts distinct days seen, not refreshes.
 * Returns the new collection and the ids discovered for the first time.
 */
export function recordSeen(collection, entries, today) {
  const next = { ...collection };
  const fresh = [];
  for (const { id, svc } of entries) {
    const prev = next[id];
    if (!prev) {
      next[id] = { svc, first: today, last: today, days: 1, rode: false };
      fresh.push(id);
    } else if (prev.last !== today) {
      next[id] = { ...prev, last: today, days: prev.days + 1 };
    }
  }
  return { collection: next, fresh };
}

export function toggleRode(collection, id) {
  if (!collection[id]) return collection;
  return { ...collection, [id]: { ...collection[id], rode: !collection[id].rode } };
}

export function collectionStats(collection) {
  const ids = Object.keys(collection);
  return { met: ids.length, rode: ids.filter((id) => collection[id].rode).length };
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
