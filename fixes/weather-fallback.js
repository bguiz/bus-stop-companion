// Forecast cache policy: a failed refresh keeps the last good forecast for up to maxStaleMs.
export function needsFetch({ cached, cachedAt, now, ttlMs }) {
  return !cached || now - cachedAt > ttlMs;
}

// `fetched` is the refresh result, or null/undefined if the refresh failed (or was not attempted).
export function chooseForecast({ cached, cachedAt, now, fetched, ttlMs, maxStaleMs }) {
  if (!needsFetch({ cached, cachedAt, now, ttlMs })) return cached;
  if (fetched) return fetched;
  if (cached && now - cachedAt <= maxStaleMs) return cached;
  return null;
}

// Theme for a draw: a missing weather (failure) keeps the current theme; only the first load defaults to fair.
export function themeKind(w, current) {
  return w ? w.kind : (current || 'fair');
}
