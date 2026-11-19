# Bus Stop Companion

Live Singapore bus arrivals where every bus service is secretly an anime character. Stages 1 to 3 of [PRD.md](PRD.md): live arrivals with characters, a collection, and a living scene.

Static site: no build step, no server, no keys.

## Run

```bash
npm run serve   # http://localhost:8765 (any static server works; ES modules need http, not file://)
npm test        # unit tests for lib.js
```

## Files

- `index.html`, `style.css`, `app.js`: the page and its UI logic
- `lib.js`: pure logic (hashing, character assignment, weather, dialogue, collection, scene maths)
- `scene.js`: the living-scene canvas (Stage 3)
- `dialogue.js`: static dialogue templates per archetype
- `data/stops.json`: bundled bus-stop list (generated)
- `data/characters.json`: the **frozen** character pool (AniList IDs), curated 2026-11-19 from the top-favourited non-adult characters minus dark/violent series (Berserk, Chainsaw Man, Tokyo Ghoul, Vinland Saga, Monster, Death Note, Attack on Titan Final Season, Cyberpunk: Edgerunners). Changing it changes which character each bus number gets, so leave it alone once you've started using the app
- `scripts/build-data.mjs`: one-off generator for the two data files (never overwrites `characters.json`)

## URLs

- `/` is always the empty home page (carousel and stop picker)
- `/?stop=53009` opens a stop directly

## Deploy

Publish the folder as-is to any static host (for example GitHub Pages).
