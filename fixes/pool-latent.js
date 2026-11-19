// Collection view helpers: ignore stored ids that are no longer in the pool.
// Returns a new object; the stored collection is never mutated.
export function collectionForPool(pool, collection) {
  const ids = new Set(pool.map((c) => String(c.id))); // object keys are strings; pool ids are numbers
  const out = {};
  for (const [id, v] of Object.entries(collection)) if (ids.has(id)) out[id] = v;
  return out;
}

export function selectedEntry(pool, selectedId) {
  return pool.find((c) => c.id === selectedId) ?? null;
}
