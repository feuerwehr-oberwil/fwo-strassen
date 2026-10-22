import type { Region } from '../../src/region.ts'
import { cachedZip } from '../download.ts'
import type { Line, Polygon, XY } from '../geometry.ts'
import type { SourceData } from '../source.ts'
import { readCsv } from './csv.ts'
import { readTable, type Shape } from './filegdb.ts'

// Swiss towns from swisstopo open data (free use with attribution), in LV95:
// - Amtliches Strassenverzeichnis: names and status (CSV), street lines (GDB layer PURE_LIN)
//   and named areas as polygons (PURE_PLY). swisstopo publishes the geometry only as File
//   Geodatabase or INTERLIS, read here with a small built-in FileGDB reader.
// - Amtliches Gebäudeadressverzeichnis: every building address with coordinates (CSV).
// The downloads cover all of Switzerland (~150 MB) and are cached in pipeline/cache.

const STREETS =
  'https://data.geo.admin.ch/ch.swisstopo.amtliches-strassenverzeichnis/amtliches-strassenverzeichnis_ch/amtliches-strassenverzeichnis_ch_2056'
const ADDRESSES =
  'https://data.geo.admin.ch/ch.swisstopo.amtliches-gebaeudeadressverzeichnis/amtliches-gebaeudeadressverzeichnis_ch/amtliches-gebaeudeadressverzeichnis_ch_2056'

/** LV95 (EPSG:2056). */
export const LV95 =
  '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs'

export async function swisstopo(region: Region): Promise<SourceData> {
  const { bfs } = region.source
  const [gdb, streetCsv, addressCsv] = [
    await cachedZip(`${STREETS}.gdb.zip`),
    await cachedZip(`${STREETS}.csv.zip`),
    await cachedZip(`${ADDRESSES}.csv.zip`),
  ]
  const inTown = (line: string) => line.includes(`;${bfs};`)

  const names = new Map<number, string>()
  for await (const r of readCsv(streetCsv, inTown))
    if (Number(r.COM_FOSNR) === bfs && r.STR_STATUS === 'real') names.set(Number(r.STR_ESID), r.STN_LABEL!)

  const shapes = (layer: string) => {
    const found = new Map<number, Shape>()
    for (const row of readTable(gdb, layer)) {
      const id = row.get('STR_ESID')
      const shape = typeof id === 'number' && names.has(id) ? row.shape() : null
      if (typeof id === 'number' && shape) found.set(id, shape)
    }
    return found
  }
  const [lines, polygons] = [shapes('PURE_LIN'), shapes('PURE_PLY')]
  const ids = [...names.keys()].toSorted((a, b) => a - b)
  for (const id of ids) if (!lines.has(id) && !polygons.has(id)) console.log(`skipping ${names.get(id)}: no geometry`)

  const addresses: SourceData['addresses'] = []
  let station: SourceData['station'] | undefined
  for await (const r of readCsv(addressCsv, inTown)) {
    if (Number(r.COM_FOSNR) !== bfs || r.ADR_STATUS !== 'real') continue
    const at: XY = [Number(r.ADR_EASTING), Number(r.ADR_NORTHING)]
    addresses.push({ streetId: r.STR_ESID!, number: r.ADR_NUMBER!, at })
    if (!station && r.STN_LABEL === region.station.street && r.ADR_NUMBER === region.station.number) station = at
  }
  if (!station) throw new Error(`station address ${region.station.street} ${region.station.number} not found`)

  return {
    attribution: '© swisstopo – Amtliches Strassenverzeichnis, Amtliches Gebäudeadressverzeichnis',
    crs: LV95,
    streets: ids.flatMap((id) => {
      const shape = lines.get(id)
      return shape ? [{ id: String(id), name: names.get(id)!, lines: shape.parts }] : []
    }),
    areas: ids.flatMap((id) => {
      const shape = polygons.get(id)
      return shape && !lines.has(id)
        ? [{ id: String(id), name: names.get(id)!, polygons: toPolygons(shape.parts) }]
        : []
    }),
    addresses,
    station,
  }
}

/** Esri rings to polygons: clockwise rings are outer rings, the counter-clockwise ones after them their holes. */
function toPolygons(rings: Line[]): Polygon[] {
  const polygons: Polygon[] = []
  for (const ring of rings) {
    const area = ring.slice(1).reduce((sum, p, i) => sum + ring[i]![0] * p[1] - p[0] * ring[i]![1], 0)
    const last = polygons.at(-1)
    if (area < 0 || !last) polygons.push([ring])
    else last.push(ring)
  }
  return polygons
}
