// Runs scripts/build-data.mjs in a temporary folder with fetch and the 2.5 s pauses faked.
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function runBuildData({ existingCharacters } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'build-data-'));
  if (existingCharacters) {
    mkdirSync(join(dir, 'data'));
    writeFileSync(join(dir, 'data/characters.json'), existingCharacters);
  }
  const requests = [];
  const realFetch = globalThis.fetch;
  const realSetTimeout = globalThis.setTimeout;
  const realLog = console.log;
  const logs = [];
  let id = 0;
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).includes('stops.min.json')) return { json: async () => ({ 10009: [103.8, 1.28, 'Bt Merah Int', 'Bt Merah Ctrl'] }) };
    // Every third character is from adult media and must be skipped.
    const characters = Array.from({ length: 50 }, (_, i) => {
      id += 1;
      return { id, name: { full: `C${id}` }, favourites: 1, media: { nodes: [{ isAdult: i % 3 === 0 }] } };
    });
    return { json: async () => ({ data: { Page: { characters } } }) };
  };
  globalThis.setTimeout = (fn) => realSetTimeout(fn, 0);
  console.log = (...a) => logs.push(a.join(' '));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    await import('../../scripts/build-data.mjs?test');
  } finally {
    process.chdir(cwd);
    globalThis.fetch = realFetch;
    globalThis.setTimeout = realSetTimeout;
    console.log = realLog;
  }
  const read = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null);
  return { requests, logs, stops: read('data/stops.json'), characters: read('data/characters.json') };
}
