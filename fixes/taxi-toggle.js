// Pure decisions for the taxi toggle.

/** Taxis to hand to the scene: none when hidden. */
export function sceneTaxis(show, taxis) {
  return show && Array.isArray(taxis) ? taxis : [];
}

/** Does showing taxis need a network request? Only when shown and the cache is missing or stale. */
export function needsTaxiFetch(show, cached, cachedAt, now, ttlMs) {
  if (!show) return false;
  return !cached || now - cachedAt > ttlMs;
}
