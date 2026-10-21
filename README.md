# Strassen-Trainer Oberwil

Web app for Feuerwehr Oberwil drivers to learn the streets of Oberwil BL – phone layout plus a
sidebar layout on desktop (≥ 1024 px).

Practice happens in rounds of 10 questions, then a summary with the misses:

- **Strasse finden**: a street or named area is given, tap it on the map.
- **Strasse benennen**: one street is highlighted, pick its name from four nearby streets.
- **Hausnummern** (switch, off by default): adds questions like «Hohestrasse – wo liegt Nr. 150–189?»
  for long streets (> 500 m); tap the right section. After answering, all sections show in colour.

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

## Data

`public/oberwil.json` is generated and committed. To refresh it from swisstopo:

```sh
pnpm data                        # = cd data && uv run build.py  (~150 MB download, cached in data/cache)
cd data && uv run pytest         # tests for the house-number sections
```

Sources: swisstopo «Amtliches Strassenverzeichnis» and «Amtliches Gebäudeadressverzeichnis»
(BFS-Nr. 2771).
