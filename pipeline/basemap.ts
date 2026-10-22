import { gunzipSync } from 'node:zlib'
import type { StyleSpecification } from 'maplibre-gl'
import type { Town } from '../src/town.ts'

// swisstopo's light base map, trimmed to what the trainer needs. Re-run when swisstopo updates
// its style.
//
// Compared to the original style this drops the relief source, every label and pattern layer (so
// no fonts or sprites are fetched), inlines the tile URLs (no tiles.json round trip) and limits the
// source to the town area, so the map never requests tiles outside town.

const STYLE = 'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json'
const MARGIN = 0.02 // degrees around the town (~1.5 km)
const DROP_SOURCE_LAYERS = new Set(['hillshade', 'hachure', 'contour_line', 'scree', 'aeroway'])

type TileJson = { tiles: string[]; minzoom?: number; maxzoom?: number; attribution?: string }

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const body = Buffer.from(await res.arrayBuffer())
  // geo.admin.ch serves gzip even when not asked to
  return JSON.parse((body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body) : body).toString('utf8'))
}

export async function basemap(town: Town, townName: string): Promise<StyleSpecification> {
  const style = await get<StyleSpecification>(STYLE)
  const [baseId, base] = Object.entries(style.sources).find(([k]) => k.startsWith('base')) ?? []
  if (!baseId || !base || !('url' in base) || !base.url)
    throw new Error(`${STYLE}: no base source with a tiles.json url`)
  const tilejson = await get<TileJson>(base.url)
  const [w, s, e, n] = town.bbox
  const round4 = (v: number) => Number(v.toFixed(4))

  const layers = style.layers.filter(
    (layer) =>
      layer.type !== 'symbol' &&
      (!('source' in layer) || layer.source === baseId) &&
      !('source-layer' in layer && DROP_SOURCE_LAYERS.has(layer['source-layer'] ?? '')) &&
      !JSON.stringify('paint' in layer ? (layer.paint ?? {}) : {}).includes('pattern'),
  )
  return {
    version: 8,
    name: `${townName} – swisstopo light base map, trimmed`,
    sources: {
      [baseId]: {
        type: 'vector',
        tiles: tilejson.tiles,
        minzoom: tilejson.minzoom ?? 0,
        maxzoom: tilejson.maxzoom ?? 14,
        bounds: [round4(w - MARGIN), round4(s - MARGIN), round4(e + MARGIN), round4(n + MARGIN)],
        attribution: tilejson.attribution ?? '© swisstopo',
      },
    },
    layers,
  }
}
