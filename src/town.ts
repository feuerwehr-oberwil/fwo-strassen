import type { Geometry, LineString, MultiLineString } from 'geojson'

// Shape of public/oberwil.json, written by data/build.py.
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
}

export type Town = {
  source: string
  bbox: BBox
  items: Item[]
}

/** Items in learning order: long streets first, named areas last. */
export function byImportance(items: Item[]): Item[] {
  return items.toSorted((a, b) => (b.lengthM ?? -1) - (a.lengthM ?? -1) || a.name.localeCompare(b.name, 'de'))
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

/** Box around all streets – the overview, without far-out named areas. */
export function streetsBBox(items: Item[]): BBox {
  return items.filter((i) => i.kind === 'street').reduce<BBox>((acc, i) => union(acc, i.bbox), [180, 90, -180, -90])
}

/** Grows a bbox to also cover `other`. */
export function union(a: BBox, b: BBox): BBox {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]
}

export const sectionLabel = (s: Section) => `${s.from}–${s.to}`
