// A repeat confirmation for the same character inside this window is a double tap, not a new ride.
export const REPEAT_WINDOW_MS = 5 * 60 * 1000;

/** True when `prev` (a collection entry) was boarded less than the window before nowMs. Entries without lastAt never match. */
export function isRepeatBoarding(prev, nowMs) {
  if (!prev || typeof prev.lastAt !== 'number') return false;
  const gap = nowMs - prev.lastAt;
  return gap >= 0 && gap < REPEAT_WINDOW_MS;
}
