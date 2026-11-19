// Pure decision for carousel stepping. direction: +1 (next) or -1 (previous).
// Returns { index, smooth }; smooth is false when the step wraps around
// (or there is nothing to move to), so the carousel jumps instead of sweeping.
export function slideStep(index, count, direction) {
  const n = Math.floor(count);
  if (!Number.isFinite(n) || n < 1) return { index: 0, smooth: false };
  const cur = Number.isFinite(index) ? Math.min(n - 1, Math.max(0, Math.floor(index))) : 0;
  const dir = direction < 0 ? -1 : 1;
  const next = cur + dir;
  if (next < 0 || next >= n) return { index: (next + n) % n, smooth: false };
  return { index: next, smooth: true };
}
