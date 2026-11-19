// Pure helpers for keeping the last good bus list when a poll fails.

/** Keep the list on screen (with a status line) only when one is showing for this same stop. */
export function failureMode({ hasList, sameStop } = {}) {
  return hasList && sameStop ? 'keep-list' : 'full-error';
}

/** Status line text for a list that is ageMs old. */
export function staleLabel(ageMs) {
  const ms = Number.isFinite(ageMs) && ageMs > 0 ? ageMs : 0;
  const mins = Math.floor(ms / 60000);
  let age = 'under a minute';
  if (mins >= 60) age = `${Math.floor(mins / 60)} hr`;
  else if (mins >= 1) age = `${mins} min`;
  return `Could not refresh. Showing times from ${age} ago.`;
}
