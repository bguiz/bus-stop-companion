// Pure helpers for drawing the bus board. No DOM. Tested in tests/p2-board.test.mjs.

/**
 * Load one board. Arrivals decide when we first draw; weather and artwork are decoration.
 * Draws once with cached artwork and the last known weather, then again as each arrives.
 * Arrivals errors propagate; weather and artwork errors are swallowed.
 * Resolves after the first draw with { done }, which settles once decoration has been applied.
 * prepare(arrivals) returns the character ids to fetch, or null when there is nothing to draw
 * (then onEmpty, if given, hears about weather instead).
 */
export async function loadBoard({
  fetchArrivals, fetchWeather, fetchChars, cachedChars, lastWeather, prepare, render, isCurrent, onEmpty,
}) {
  const weatherP = Promise.resolve().then(fetchWeather).catch(() => null);
  const arrivals = await fetchArrivals();
  if (!isCurrent()) return { done: Promise.resolve() };
  const ids = prepare(arrivals);
  if (!ids) {
    const done = weatherP.then((weather) => { if (weather && isCurrent() && onEmpty) onEmpty({ weather }); });
    return { done };
  }
  let weather = lastWeather() ?? null;
  let chars = cachedChars() ?? {};
  const draw = () => { if (isCurrent()) render({ arrivals, weather, chars }); };
  draw();
  const weatherDone = weatherP.then((w) => { if (w) { weather = w; draw(); } });
  const charsDone = Promise.resolve().then(() => fetchChars(ids)).then(
    (c) => { if (c) { chars = c; draw(); } },
    () => {},
  );
  return { done: Promise.all([weatherDone, charsDone]).then(() => {}) };
}

/** Which keyed items to keep, add and remove, and the final order. */
export function reconcileKeys(prevKeys, nextKeys) {
  const prev = new Set(prevKeys);
  const next = new Set(nextKeys);
  return {
    keep: nextKeys.filter((k) => prev.has(k)),
    add: nextKeys.filter((k) => !prev.has(k)),
    remove: prevKeys.filter((k) => !next.has(k)),
    order: [...nextKeys],
  };
}
