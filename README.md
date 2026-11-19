# Bus stop aibou 相棒

Live Singapore bus arrivals where every bus service is secretly an anime character. Stages 1 to 3 of [PRD.md](PRD.md): live arrivals with characters, a collection, and a living scene.

Static site: no build step, no server, no keys.

## Run

```bash
npm run serve   # http://localhost:8765 (any static server works; ES modules need http, not file://)
npm install     # once: installs happy-dom, used only by the tests
npm test        # all tests
npm run coverage  # tests with a coverage report; fails below 70% lines, branches or functions
```

## Files

- `index.html`, `style.css`, `app.js`: the page and its UI logic
- `lib.js`: pure logic (hashing, character assignment, weather, dialogue, collection, scene maths)
- `scene.js`: the living-scene canvas (Stage 3)
- `board.js`: pure helpers for drawing the bus list (draw-first loading, in-place card updates)
- `fixes/`: small pure helpers behind individual bug fixes, each with a matching `tests/p3-*.test.mjs`
- `tests/`: `node --test` suites. `tests/helpers/browser.mjs` runs the real `index.html` and `app.js` in happy-dom with the network faked; each `app-*.test.mjs` file boots one page, because Node counts coverage for only one copy of `app.js` per process
- `icon.svg`, `icons/`, `manifest.webmanifest`: the logo (a bus with a face whose destination board reads 相棒), the home screen icons and the web manifest. `python3 scripts/make-logo.py` rebuilds the SVG from `scripts/aibou-dots.txt` and renders the PNGs with Chrome
- `dialogue.js`: static dialogue templates per archetype, in English and Japanese
- `talk.js`: the double-click animation (a picture floats out, pulses twice and shows a bilingual speech bubble)
- `data/stops.json`: bundled bus-stop list (generated)
- `data/characters.json`: the **frozen** character pool (AniList IDs), curated 2026-11-19 from the top-favourited non-adult characters minus dark/violent series (Berserk, Chainsaw Man, Tokyo Ghoul, Vinland Saga, Monster, Death Note, Attack on Titan Final Season, Cyberpunk: Edgerunners). Changing it changes which character each bus number gets, so leave it alone once you've started using the app
- `scripts/build-data.mjs`: one-off generator for the two data files (never overwrites `characters.json`)

## URLs

- `/` is always the empty home page (carousel and stop picker)
- `/?stop=53009` opens a stop directly

## Deploy

Publish the folder as-is to any static host (for example GitHub Pages).
