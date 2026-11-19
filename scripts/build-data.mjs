// One-off data snapshot. Run: node scripts/build-data.mjs
// Writes data/stops.json and, if missing, data/characters.json (a STARTER pool the owner should curate; once chosen, keep it frozen).
import { writeFile, access, mkdir } from 'node:fs/promises';

await mkdir('data', { recursive: true });

// 1. Bus stops: { code: [lng, lat, name, road] } from the community busrouter dataset.
const stops = await (await fetch('https://data.busrouter.sg/v1/stops.min.json')).json();
await writeFile('data/stops.json', JSON.stringify(stops));
console.log('stops:', Object.keys(stops).length);

// 2. Characters: starter pool of top-favourited AniList characters from non-adult media.
const exists = await access('data/characters.json').then(() => true, () => false);
if (exists) {
  console.log('data/characters.json exists, leaving it frozen');
} else {
  const query = `query ($page:Int){ Page(page:$page, perPage:50){ characters(sort:FAVOURITES_DESC){
    id name{ full } favourites media(perPage:3){ nodes{ isAdult } } } } }`;
  const picked = [];
  for (let page = 1; page <= 6 && picked.length < 150; page++) {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { page } }),
    });
    const json = await res.json();
    for (const c of json.data.Page.characters) {
      if (c.media.nodes.some((m) => m.isAdult)) continue;
      picked.push({ id: c.id, name: c.name.full });
    }
    await new Promise((r) => setTimeout(r, 2500)); // stay well under 30 requests/min
  }
  const chars = picked.slice(0, 150);
  await writeFile('data/characters.json', JSON.stringify(chars, null, 1));
  console.log('characters:', chars.length);
}
