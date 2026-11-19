// Nearest-stop helpers for "Use my location" (pure, no DOM).

export const TOO_FAR_METERS = 5000;

function haversine(lat0, lng0, lat, lng) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const a = Math.sin(((lat - lat0) * rad) / 2) ** 2
    + Math.cos(lat0 * rad) * Math.cos(lat * rad) * Math.sin(((lng - lng0) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The `count` closest stops as [{ code, meters }], nearest first. */
export function nearestStops(stops, lat, lng, count = 6) {
  return Object.entries(stops)
    .map(([code, [slng, slat]]) => ({ code, meters: haversine(lat, lng, slat, slng) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, count);
}

export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Decide what the picker shows: a too-far message, or the nearest stops. */
export function locationOutcome(stops, lat, lng) {
  const items = nearestStops(stops, lat, lng);
  const first = items[0];
  if (!first || first.meters > TOO_FAR_METERS) {
    const km = first ? Math.round(first.meters / 1000) : 0;
    return {
      tooFar: true, items: [], codes: [], km: first ? first.meters / 1000 : 0,
      note: `You do not seem to be in Singapore (the nearest stop is ${km} km away). Use search instead.`,
    };
  }
  return { tooFar: false, items, codes: items.map((i) => i.code), km: first.meters / 1000, note: 'Nearest stops to you:' };
}
