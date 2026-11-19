# PRD: Bus Stop Companion (working title)

Status: draft, agreed in a product-thinking grilling session (2026-11-19), revised after review the same day.
Audience: the builder (solo, for fun). Product-thinking lessons used for reference: `/Users/bguiz/code/bguiz/prod-think-app/lessons`.

## 1. Problem (Lessons 1-3)

### Five Whys
(Hypothesis chain; the owner flagged it as the most-guessed part. Revise after the week-long test.)
1. Google Maps feels boring at the bus stop.
2. It presents each bus as a data row (number, minutes, line).
3. It is built to be efficient and neutral, not to be enjoyed.
4. Its job ends at "tell me when the bus comes"; the time spent waiting is treated as dead time.
5. **Root cause: nothing is designed for the waiting moment itself.** Within the owner's influence; fixing it does not leave the symptom in place. (Anime characters are one candidate fix for this cause, not part of the cause.)

### Problem statement (4Cs, no solution named)
- **Clarity:** One person (the owner), standing at a Singapore bus stop several times a week, finds the moment of checking bus arrivals dull. The information works; there is no pleasure in it.
- **Consequence:** Low stakes. They would keep using Google Maps. This is therefore worth doing only as a for-fun personal tool, and is scoped that way.
- **Cause:** Existing tools optimise for efficiency and treat the wait as dead time; nothing is designed for it.
- **Confirmation:** Thin: one observation (a bus ride on the morning of 2026-11-19, "Google Maps looks kinda boring"). The one-week test (section 4) is how real evidence is gathered.

## 2. Success (Lesson 4)

- **Outcome:** The owner opens it at the bus stop because they want to, not because they must.
- **SMART metric:** On at least 5 of the days the owner rides a bus, in each of the first two weeks of use, the page is opened at the stop on the owner's own initiative.
- **How it is measured:** the page records each day it is opened (one date per day, in `localStorage`, no other data) and the owner notes which days they rode a bus. Whether an open was voluntary is the owner's own judgment in the weekly check-in.
- **Indicator chain:**
  - Leading: opened on day 1.
  - Middle: opened again on day 3 without a reminder (read from the open-day log).
  - Lagging: the owner says they would miss it if it disappeared.
- **Decision rule:** if fewer than 3 voluntary opens in week 1, do not start Stage 2. Revisit the experience (section 5) and the Five Whys first.
- **Value-cost:** Value = days used; cost = build hours. Deliberately not given a number; this is a for-fun tool.

## 3. Users and scope

- **User:** the owner only. No accounts, no onboarding, no sharing in v1.
- **Out of scope:** route planning, journey times between stops, notifications, a backend, accounts, monetisation, other users.

## 4. Risks and experiment (Lesson 5)

| Risk | Type | Mitigation |
|---|---|---|
| Not fun by day 3; novelty fades | Market (key risk) | Ship Stage 1 and use it on real rides for one week |
| arrivelah2 is a community proxy, may rate-limit or vanish | Technical | Respect ~15s cache, poll gently, fail gracefully with a friendly message; wrap the API in one module so it can be swapped for LTA DataMall |
| AniList rate limit (30 requests per minute, verified) | Technical | Frozen ID list plus local cache of character details; POST CORS preflight verified 2026-11-19 |
| Scope creep to the 11-star version | Team (self) | Stages below; each stage must be usable before the next starts |

**Simplest experiment:** use Stage 1 on real bus rides for one week and record, per day, whether it was opened voluntarily.

## 5. Experience ladder (Lesson 6)

- **5 stars (baseline):** correct buses and timings. This is Google Maps and is not enough.
- **7 stars:** each bus has a character, and it comments on the weather and the crowd level.
- **11 stars (direction, not target):** a living anime street scene where buses move as characters in real time, and weather changes the art style.

## 6. Staged delivery (Lesson 7)

Every stage leaves the owner with something usable.

### Stage 1: skateboard (built)
One static page. Pick a stop, then each arriving bus is shown as a character with weather-aware and crowd-aware dialogue.

Functional requirements:
- **F1 Stop selection:** search a bundled static list of bus stops by name or code (generated once from `https://data.busrouter.sg/v1/stops.min.json`, bundled so the page doesn't depend on that host at runtime). Offer a "nearest stops" button using browser geolocation (HTTPS required; fall back to search if denied). Remember the last-used stop in `localStorage`.
- **F2 Live arrivals:** for the selected stop, show the next buses per service from arrivelah2 (`/?id=<stop code>`): minutes away (from `duration_ms`), crowd load (`SEA` seats, `SDA` standing, `LSD` limited standing), bus type and operator. Treat negative or zero durations as "arriving". Treat `monitored: 0` or `lat/lng = 0` as "no live GPS yet" and say so.
- **F3 Hidden identity:** each bus service number deterministically maps to one anime character. Same number, same character, every time, including across weeks.
  - The pool is a **frozen, hand-curated list of AniList character IDs committed to the repo** (not a live "popular" query, which drifts). The owner curates it, which also keeps out unsuitable entries.
  - Character details (name, image) are fetched by ID and cached in `localStorage`, to stay well under AniList's 30 requests per minute limit.
  - The service number alone is hashed into the pool, so a bus is the same character at every stop. Two buses at one stop can occasionally share a character. (An earlier version moved a colliding bus to the next free character, which made a bus's character depend on the other buses at the stop. A code review found that and the rule was dropped; see section 10.)
- **F4 Weather scene:** current conditions from the data.gov.sg real-time APIs (2-hour forecast and/or rainfall) set the mood of the page and the character's dialogue. Each stop is matched to the nearest forecast area using the coordinates in the stop list and the API's area metadata.
- **F5 Dialogue:** short, reactive lines chosen from a local template set keyed on (character archetype, weather, crowd, minutes-away). Each character gets an archetype voice (for example cheerful, stoic, tsundere) chosen by the same hash as F3, so lines feel character-specific. Templates live in the repo, not generated at runtime.
- **F6 Resilience:** loading, error and offline states; no blank screen if an API fails. Specific empty states: no service (night), a stop with no buses, and every bus without live GPS. Refresh no faster than every 15 seconds.
- **F7 Open log:** record the date of each open (one date per day, in `localStorage`) so the success metric can be read. No other tracking.

Non-functional requirements:
- Hosted statically (e.g. GitHub Pages), no server-side code, no secrets in the client.
- All three network dependencies must allow browser-origin calls. Verified so far: arrivelah2 and data.gov.sg send `access-control-allow-origin: *` on GET. AniList was verified for GET only; its POST preflight is to be verified in step one of the build.
- Mobile-first layout, readable in direct sun at a bus stop.
- Credit AniList and the data sources on the page. Character artwork belongs to its rights holders; it is hot-linked from AniList for a personal page, not copied into the repo.

Done when: the owner can open the page on their phone at a real stop and see characters for the arriving buses, and the page survives an API failure.

### Stage 2: collection (built)
Save characters for the bus numbers the owner has seen or ridden (browser storage). A simple collection view.

### Stage 3: living scene (built)
Stylised map/scene with buses moving in real time from GPS, weather-reactive visuals, optional taxi-availability spirits from the data.gov.sg taxi API.

## 7. Data sources

| Source | Use | Auth | CORS |
|---|---|---|---|
| arrivelah2 (`https://arrivelah2.busrouter.sg/?id=<stop>`) | Live arrivals, GPS, crowd | none | `*` (verified) |
| data.gov.sg real-time APIs (`https://api-open.data.gov.sg/v2/real-time/api/...`) | Weather, rainfall, later taxis | optional `x-api-key` for higher limits | `*` (verified on 2-hour forecast and taxi endpoints) |
| AniList GraphQL (`https://graphql.anilist.co`) | Characters and artwork | none | `*`; POST preflight verified (allows `POST`, `Content-Type`); 30 requests per minute |
| `data.busrouter.sg/v1/stops.min.json` | One-off source for the bundled stop list | none | `*` (verified); not used at runtime |

Note: the data.gov.sg real-time APIs do not include bus data, which is why arrivelah2 is used.

## 8. Design inspiration

The string `1gMzjPkcteDQXw98TiP1lmvuzr3iwOQ8ztXpV2FWY` could not be decoded and is treated as an opaque ID. The inspiration taken from it is "an opaque ID hides an identity": every bus service number hides a character (F3).

## 9. Open questions

- Pool size and curation: how many characters (suggest 100 to 200) and the owner's picks. The list is frozen once chosen.
- Is dialogue static templates only, or later LLM-generated? Default: static templates in v1.
- Stop-list refresh process. Default: one-off generated file, updated by hand if stops change.
- Revisit the Five Whys after the one-week test; if the test fails, check Market risk and the Confirmation evidence first.

## 10. Build notes (added after Stages 2 and 3 were built)

- Stages 2 and 3 were built before the week-1 test result, at the owner's request. The decision rule in section 2 still applies to what comes next: judge the experience by the open-day log before adding more.
- **Landing carousel (owner request):** with no stop chosen, the landing page shows a carousel of 12 well-known bus services, each with its character and a sample line. It auto-advances, pauses on touch, and does not auto-advance for people who prefer reduced motion.
- **Collection (revised):** a character joins the collection only after the owner taps "I boarded this" on a bus card and confirms. Seeing a bus is not enough. Boarding the same character again counts another ride. Stored in the browser only (`collection-v2`); earlier entries are carried over only if they had been marked ridden.
- **Routing:** each stop has its own URL (`?stop=CODE`), so the back button works and stops can be bookmarked. The bare path always opens an empty home page, with a "Back to <last stop>" shortcut.
- **Scene:** a canvas radar around the stop. Buses with live GPS appear as their characters at real positions and glide between updates; weather changes the sky and adds rain, lightning, haze, clouds or sparkles; nearby taxis from the data.gov.sg taxi API drift as "spirits" (toggleable). Terminals often have no GPS yet, so few buses are placed there.
- **Review fixes (2026-11-19):** a code review found three P1 bugs, each now covered by tests in `tests/regressions.test.mjs`: (1) a slow refresh for an old stop could draw over a newer stop or the home page, fixed with a latest-stop-wins gate; (2) a link like `?stop=constructor` crashed startup, fixed with an own-property stop lookup and a fallback to the home page; (3) a bus's character depended on the other buses at the stop, fixed by deriving it from the service number alone. Fix 3 reverses the earlier choice to give every bus at a stop a different character, because that and a stable identity cannot both hold with 136 characters.
- **P2 fixes (2026-11-19):** seven lower-priority review findings are fixed, each with tests that failed first: (P2-1) bus cards draw as soon as arrivals return, with weather and artwork filled in when they arrive and never blocking or breaking the list; (P2-2) cards are updated in place so focus, loaded pictures and the entry animation survive a poll; (P2-3) boarding buttons and the taxi toggle are at least 44 px tall; (P2-4) stop search ranks name matches first and says "Showing 25 of N"; (P2-5) re-selecting the open stop replaces the history entry; (P2-6) collected characters are listed first; (P2-7) the open-day log counts only days a stop was viewed, so earlier home page loads are no longer counted. The open-day footer now reads "Used at a stop on N days".

