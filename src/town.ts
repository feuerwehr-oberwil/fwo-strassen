import type { Geometry, LineString, MultiLineString, Position } from 'geojson'

// Shape of data/town.json, written by pipeline/town.ts.
export type LngLat = [lng: number, lat: number]
export type BBox = [west: number, south: number, east: number, north: number]

export type Section = {
  from: number
  to: number
  /** Streets branching off this section, in order along it. */
  crossStreets: string[]
  geometry: LineString | MultiLineString
}

export type Item = {
  id: string
  name: string
  /** "area" = named area (Flurname) without a street line, drawn as a polygon. */
  kind: 'street' | 'area'
  lengthM: number | null
  center: LngLat
  bbox: BBox
  geometry: Geometry
  /** House-number sections, only for long streets. */
  sections: Section[]
  /**
   * Where a shorter street's house numbers start (`low`, Nr. `from`) and end (`high`, Nr. `to`);
   * only where they clearly run from one end to the other.
   */
  ends?: { from: number; to: number; low: LngLat; high: LngLat }
}

export type Town = {
  source: string
  bbox: BBox
  items: Item[]
  /** Feuerwehrmagazin, the only marker on the map. */
  station: LngLat
}

/** Items in learning order: long streets first, named areas last; ties by name in `locale`. */
export function byImportance(items: Item[], locale: string): Item[] {
  return items.toSorted((a, b) => (b.lengthM ?? -1) - (a.lengthM ?? -1) || a.name.localeCompare(b.name, locale))
}

/** The `n` items of the same kind closest to `item` – plausible wrong answers. */
export function neighbours(item: Item, items: Item[], n: number): Item[] {
  const dist = (o: Item) =>
    Math.hypot(
      (o.center[0] - item.center[0]) * Math.cos((item.center[1] * Math.PI) / 180),
      o.center[1] - item.center[1],
    )
  return items
    .filter((o) => o.kind === item.kind && o.id !== item.id)
    .toSorted((a, b) => dist(a) - dist(b))
    .slice(0, n)
}

/**
 * The town at a glance: the box around the middle 90 % of street centres. Leaves out far-out
 * streets and named areas, so the start view is zoomed in enough to tap most streets directly.
 */
export function coreBBox(items: Item[]): BBox {
  const centres = items.filter((i) => i.kind === 'street').map((i) => i.center)
  const band = (axis: 0 | 1) => {
    const sorted = centres.map((c) => c[axis]).toSorted((a, b) => a - b)
    const at = (p: number) => sorted[Math.round(p * (sorted.length - 1))]!
    return [at(0.05), at(0.95)] as const
  }
  const [w, e] = band(0)
  const [s, n] = band(1)
  return [w, s, e, n]
}

/**
 * Truck routes from the station (data/routes.json, written by pipeline/routes.ts), keyed
 * "<id>" for streets and areas, "<id>:<from>-<to>" for house-number sections and "<id>:start" for
 * the end where a shorter street's numbering starts.
 */
export type Routes = Record<string, LngLat[]>

/** The box around some points. */
export function bboxOf(points: LngLat[]): BBox {
  const lngs = points.map((p) => p[0])
  const lats = points.map((p) => p[1])
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)]
}

/** The first `fraction` (0–1) of a line, by length; the route animation draws it bit by bit. */
export function cutLine(line: LngLat[], fraction: number): LngLat[] {
  const cos = Math.cos(((line[0]?.[1] ?? 0) * Math.PI) / 180)
  const seg = line.slice(1).map((p, i) => Math.hypot((p[0] - line[i]![0]) * cos, p[1] - line[i]![1]))
  let left = fraction * seg.reduce((a, b) => a + b, 0)
  const out = line.slice(0, 1)
  for (const [i, len] of seg.entries()) {
    const [a, b] = [line[i]!, line[i + 1]!]
    if (left >= len) out.push(b)
    else {
      if (left > 0) out.push([a[0] + ((b[0] - a[0]) * left) / len, a[1] + ((b[1] - a[1]) * left) / len])
      break
    }
    left -= len
  }
  return out
}

/** Grows a bbox to also cover `other`. */
export function union(a: BBox, b: BBox): BBox {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]
}

export const sectionLabel = (s: Section) => `${s.from}–${s.to}`
/**
 * A section in question and route keys: its range, not its index, so a card or route never
 * moves to another range when a street's sections change.
 */
export const sectionKey = (s: Section) => `${s.from}-${s.to}`

/** Shortest distance between two items in metres (vertex to segment, good enough at town scale). */
export function distanceM(a: Item, b: Item): number {
  const lat0 = (a.center[1] * Math.PI) / 180
  const toXY = ([lng, lat]: Position): XY => ({ x: lng! * 111_320 * Math.cos(lat0), y: lat! * 110_540 })
  const lines = (g: Geometry): XY[][] => {
    if (g.type === 'LineString') return [g.coordinates.map(toXY)]
    if (g.type === 'MultiLineString' || g.type === 'Polygon') return g.coordinates.map((l) => l.map(toXY))
    if (g.type === 'MultiPolygon') return g.coordinates.flat().map((l) => l.map(toXY))
    return []
  }
  const [la, lb] = [lines(a.geometry), lines(b.geometry)]
  const oneWay = (from: XY[][], to: XY[][]) =>
    Math.min(...from.flat().flatMap((p) => to.flatMap((l) => l.slice(1).map((q, i) => segmentDistance(p, l[i]!, q)))))
  return Math.min(oneWay(la, lb), oneWay(lb, la))
}

export type XY = { x: number; y: number }

/** Distance from point `p` to the segment a–b. */
export function segmentDistance(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const t = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}
