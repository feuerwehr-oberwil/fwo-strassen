# Strassen-Trainer Oberwil

Phone-first web app for Feuerwehr Oberwil drivers to learn the streets of Oberwil BL.

- **Name → Karte**: a street or named area is given, tap it on the map.
- **Karte → Name**: one street is highlighted, pick its name from four nearby streets.
- **Hausnummern**: long streets (> 500 m) split into house-number sections. Learn them in colour, then
  get asked «Hohestrasse 150–189 – which section?».

The map is swisstopo's light base map (buildings, forest, water) with every label removed. Progress
is stored per device in `localStorage` (spaced repetition, Leitner boxes). No backend, no login.

## Development

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm lint && pnpm test && pnpm build
```

Pushes to `main` deploy to GitHub Pages (`.github/workflows/deploy.yml`).

## Data

`public/oberwil.json` is generated and committed. To refresh it from swisstopo:

```sh
pnpm data                        # = cd data && uv run build.py  (~150 MB download, cached in data/cache)
cd data && uv run pytest         # tests for the house-number sections
```

Sources: swisstopo «Amtliches Strassenverzeichnis» and «Amtliches Gebäudeadressverzeichnis»
(BFS-Nr. 2771).
