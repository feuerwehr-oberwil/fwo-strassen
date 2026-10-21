# Strassen-Trainer Oberwil

Web app for Feuerwehr Oberwil drivers to learn the streets of Oberwil BL – phone layout plus a
sidebar layout on desktop (≥ 1024 px).

The app opens on a start screen: what's due, mode, options and progress. Practice happens in rounds
of 10 questions; new streets are first shown a few at a time (all on one map), then asked. Right
answers move on by themselves after 2 s (the «Weiter» button fills up meanwhile), the result of a
wrong one shows in the question card. After every answer a truck drives the route from the
Feuerwehrmagazin to the street, so drivers learn the best way there. The round ends with the misses,
numbered on the map, and «Fehler korrigieren».

- **Strasse finden**: a street or named area is given, tap it on the map, then «Prüfen».
- **Strasse benennen**: one street is highlighted, pick its name from four nearby streets.
- **Hausnummern** (switch, off by default): adds questions like «Hohestrasse – wo liegt Nr. 150–189?»
  for long streets (> 500 m); tap the right section. After answering, all sections show in colour.
  Shorter streets whose numbers clearly run from one end to the other ask «Wo ist Nr. 1?» instead
  (tap an end), and show their lowest and highest number at the ends whenever they appear.

Phones in landscape and screens ≥ 1024 px get a sidebar next to the map. With a mouse, the street
(or section, or end) a click would pick is highlighted.

The map is swisstopo's light base map (buildings, forest, water) with every label removed. Progress
is stored per device in `localStorage` (spaced repetition, Leitner boxes) and decides which questions
a round asks. No backend, no login.

## Development

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm lint && pnpm test && pnpm build
```

Pushes to `main` deploy to GitHub Pages (`.github/workflows/deploy.yml`).

## Progress backup

`server/` is a tiny FastAPI service (SQLite on a volume) that stores each device's cards under an
anonymous code like `rot-schnecke-4821`, so progress survives Safari's storage eviction and moves to
a new phone. No accounts, no personal data. The app syncs only when it is built with
`VITE_BACKUP_URL` set; otherwise the backup is off.

```sh
cd server && uv run --group dev pytest      # tests
cd server && uv run uvicorn app:app --reload # local, then: VITE_BACKUP_URL=http://127.0.0.1:8000 pnpm dev
```

## Data

`src/data/oberwil.json`, `src/data/routes.json` and `src/data/basemap.json` are generated, committed
and bundled into the JS. To refresh them:

```sh
pnpm data                        # = cd data && uv run build.py  (~150 MB download, cached in data/cache)
cd data && uv run routes.py      # truck routes; after build.py (OSM download via Overpass, cached)
cd data && uv run pytest         # tests for house numbers and routing
pnpm format                      # the committed JSON is prettier-formatted
```

Routes are the fastest way for a TLF: only roads a truck can use, big access roads preferred, every
turn costs time, one-way streets respected, no route through a barrier. Footpaths and fields get a
route to the nearest drivable point. What the drivers know and OpenStreetMap doesn't (missing
barriers, residential streets they use as access roads) goes into two short lists at the top of
`data/routes.py`.

Sources: swisstopo «Amtliches Strassenverzeichnis» and «Amtliches Gebäudeadressverzeichnis»
(BFS-Nr. 2771); road network © OpenStreetMap contributors (ODbL).
