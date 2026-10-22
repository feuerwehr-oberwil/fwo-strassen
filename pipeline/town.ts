import proj4 from 'proj4'
import type { Geometry } from 'geojson'
import type { BBox, Item, LngLat, Section, Town } from '../src/town.ts'
import {
  areaPoint,
  bounds,
  centroid,
  lineLength,
  linePoint,
  linesDistance,
  pointLinesDistance,
  project,
  simplify,
  substring,
  type Line,
  type Polygon,
  type XY,
} from './geometry.ts'
import type { SourceData } from './source.ts'

// Builds data/town.json from a source's streets, areas and addresses: house-number sections
// for long streets, numbering ends for shorter ones, cross streets, simplified WGS84 geometry.

const LONG_STREET_M = 500 // streets longer than this get house-number sections
const ENDS_MIN_ADDRESSES = 4 // shorter streets need this many addresses to tell where numbering starts
const ENDS_MIN_CORR = 0.8 // …and numbers that clearly grow from one end to the other (rank correlation)

/** Python's round(): halves go to the even neighbour, so 25 / 10 rounds to 2. */
export const roundHalfEven = (x: number) => {
  const r = Math.round(x)
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r
}

/** '12a' -> 12, '31.1' -> 31, '' -> null. */
export function houseNumber(label: string): number | null {
  const m = /^\d+/.exec(label)
  return m ? Number(m[0]) : null
}

/**
 * Splits house numbers into at most k contiguous ranges with round borders.
 *
 * Borders sit at address-count quantiles, rounded to a multiple of 10 (5 for short streets) so
 * drivers can remember them. Ranges without any address are dropped.
 */
export function numberRanges(numbers: number[], k: number): [from: number, to: number][] {
  const nums = numbers.toSorted((a, b) => a - b)
  const [first, last] = [nums[0]!, nums.at(-1)!]
  const step = last >= 60 ? 10 : 5
  const borders: number[] = []
  for (let i = 1; i < k; i++) {
    const b = roundHalfEven(nums[Math.floor((i * nums.length) / k)]! / step) * step
    if (b > first && b <= last && (!borders.length || b > borders.at(-1)!)) borders.push(b)
  }
  const lows = [first, ...borders]
  const highs = [...borders.map((b) => b - 1), last]
  return lows
    .map((lo, i): [number, number] => [lo, highs[i]!])
    .filter(([lo, hi]) => nums.some((n) => lo <= n && n <= hi))
}

/**
 * How many house-number sections a long street gets (0 means: none).
 *
 * Roughly one per 500 m, at most 5, and at least ~15 addresses per section, so a section is
 * worth remembering. Streets with fewer than 12 addresses get none.
 */
export function sectionCount(lengthM: number, addresses: number): number {
  if (addresses < 12) return 0
  return Math.max(2, Math.min(5, roundHalfEven(lengthM / 500), Math.floor(addresses / 15)))
}

/**
 * Cuts a street into one piece per address group (groups ordered by number).
 *
 * Each address is projected onto its nearest line part. Per part, a group covers the stretch
 * from its first to last address (outliers trimmed); neighbouring groups meet halfway so the
 * sections touch.
 */
export function sectionGeometries(lines: Line[], groups: XY[][]): Line[][] {
  const spans = new Map<number, [group: number, start: number, end: number][]>()
  groups.forEach((points, g) => {
    const byPart = new Map<number, number[]>()
    for (const p of points) {
      const distances = lines.map((l) => pointLinesDistance(p, [l]))
      const i = distances.indexOf(Math.min(...distances))
      byPart.set(i, [...(byPart.get(i) ?? []), project(lines[i]!, p)])
    }
    for (const [i, measures] of byPart) {
      const ms = measures.toSorted((a, b) => a - b)
      const trim = Math.floor(ms.length / 10) // ignore the outer 10 % on each side
      const kept = ms.slice(trim, ms.length - trim)
      const used = kept.length ? kept : ms
      spans.set(i, [...(spans.get(i) ?? []), [g, used[0]!, used.at(-1)!]])
    }
  })
  const pieces: Line[][] = groups.map(() => [])
  for (const [i, unsorted] of spans) {
    const sp = unsorted.toSorted((a, b) => (a[1] + a[2]) / 2 - (b[1] + b[2]) / 2)
    const line = lines[i]!
    const length = lineLength(line)
    sp.forEach(([g, a, b], j) => {
      const start = j > 0 ? (sp[j - 1]![2] + a) / 2 : Math.max(0, a - 25)
      const end = j < sp.length - 1 ? (b + sp[j + 1]![1]) / 2 : Math.min(length, b + 25)
      if (end - start > 5) pieces[g]!.push(substring(line, start, end))
    })
  }
  return pieces
}

/** Ranks with ties averaged (pandas' default). */
function ranks(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).toSorted((a, b) => a[0] - b[0])
  const out = Array.from(values, () => 0)
  for (let i = 0; i < order.length;) {
    let j = i
    while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j++
    for (let k = i; k <= j; k++) out[order[k]![1]] = (i + j) / 2 + 1
    i = j + 1
  }
  return out
}

/** Pearson correlation, computed like numpy's corrcoef (as the Python pipeline did): r = 0.8 can be exact. */
function correlation(a: number[], b: number[]): number {
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length
  const [ma, mb] = [mean(a), mean(b)]
  let [ab, aa, bb] = [0, 0, 0]
  a.forEach((x, i) => {
    const [da, db] = [x - ma, b[i]! - mb]
    ab += da * db
    aa += da * da
    bb += db * db
  })
  const f = 1 / (a.length - 1)
  return Math.max(-1, Math.min(1, (ab * f) / Math.sqrt(aa * f) / Math.sqrt(bb * f)))
}

/**
 * Where a shorter street's house numbers start and end: [low end, high end] of its line.
 *
 * Null when that isn't clear: loops and branches (more than one line part), fewer than
 * ENDS_MIN_ADDRESSES addresses, or numbers that don't grow steadily along the line.
 */
export function numberingEnds(lines: Line[], points: XY[], numbers: number[]): [low: XY, high: XY] | null {
  const line = lines[0]!
  if (lines.length > 1 || points.length < ENDS_MIN_ADDRESSES) return null
  const r = correlation(ranks(points.map((p) => project(line, p))), ranks(numbers))
  if (!(Math.abs(r) >= ENDS_MIN_CORR)) return null // also catches NaN (all at one spot)
  const [first, last] = [line[0]!, line.at(-1)!]
  return r > 0 ? [first, last] : [last, first]
}

/** Other streets meeting this section, in order along its longest piece. */
export function crossStreets(section: Line[], ownId: string, streets: SourceData['streets']): string[] {
  const main = section.reduce((a, b) => (lineLength(b) > lineLength(a) ? b : a))
  const found = streets
    .filter((s) => s.id !== ownId && linesDistance(s.lines, section) < 3)
    .map((s) => ({ name: s.name, along: project(main, centroid(s.lines)) }))
    .toSorted((a, b) => a.along - b.along)
  return [...new Set(found.map((s) => s.name))]
}

/** The town as the app loads it (data/town.json), from a source's raw data. */
export function buildTown(data: SourceData): Town {
  const toWgs84 = proj4(data.crs, 'WGS84')
  const round5 = (v: number) => Number(v.toFixed(5))
  const lngLat = (p: XY): LngLat => {
    const [lng, lat] = toWgs84.forward(p)
    return [round5(lng!), round5(lat!)]
  }
  const bbox = (points: XY[]): BBox => {
    const [w, s, e, n] = bounds(points)
    return [...lngLat([w, s]), ...lngLat([e, n])]
  }
  /** Metric geometry -> simplified GeoJSON in WGS84, ~1 m precision. */
  const lineGeometry = (lines: Line[]): Section['geometry'] => {
    const coords = lines.map((l) => simplify(l, 1).map(lngLat))
    return coords.length === 1
      ? { type: 'LineString', coordinates: coords[0]! }
      : { type: 'MultiLineString', coordinates: coords }
  }
  const areaGeometry = (polygons: Polygon[]): Geometry => {
    const coords = polygons.map((rings) => rings.map((r) => simplify(r, 1).map(lngLat)))
    return coords.length === 1
      ? { type: 'Polygon', coordinates: coords[0]! }
      : { type: 'MultiPolygon', coordinates: coords }
  }

  // addresses with a house number, by street
  const byStreet = Map.groupBy(
    data.addresses.flatMap((a) => {
      const n = houseNumber(a.number)
      return n === null ? [] : [{ ...a, n }]
    }),
    (a) => a.streetId,
  )

  const streets = data.streets.map((street): Item => {
    const lengthM = street.lines.reduce((sum, l) => sum + lineLength(l), 0)
    const addresses = byStreet.get(street.id) ?? []
    const sections: Section[] = []
    const k = lengthM > LONG_STREET_M ? sectionCount(lengthM, addresses.length) : 0
    if (k) {
      const ranges = numberRanges(
        addresses.map((a) => a.n),
        k,
      )
      const groups = ranges.map(([lo, hi]) => addresses.filter((a) => lo <= a.n && a.n <= hi).map((a) => a.at))
      sectionGeometries(street.lines, groups).forEach((piece, i) => {
        if (!piece.length) return
        const [from, to] = ranges[i]!
        sections.push({
          from,
          to,
          crossStreets: crossStreets(piece, street.id, data.streets),
          geometry: lineGeometry(piece),
        })
      })
    }
    const item: Item = {
      id: street.id,
      name: street.name,
      kind: 'street',
      lengthM: roundHalfEven(lengthM),
      center: lngLat(linePoint(street.lines)),
      bbox: bbox(street.lines.flat()),
      geometry: lineGeometry(street.lines),
      sections,
    }
    const nums = addresses.map((a) => a.n)
    const ends = sections.length
      ? null
      : numberingEnds(
          street.lines,
          addresses.map((a) => a.at),
          nums,
        )
    if (ends)
      item.ends = { from: Math.min(...nums), to: Math.max(...nums), low: lngLat(ends[0]), high: lngLat(ends[1]) }
    return item
  })

  const areas = data.areas.map((area): Item => ({
    id: area.id,
    name: area.name,
    kind: 'area',
    lengthM: null,
    center: lngLat(areaPoint(area.polygons)),
    bbox: bbox(area.polygons.flat(2)),
    geometry: areaGeometry(area.polygons),
    sections: [],
  }))

  // by name in code-point order (as Python sorted them)
  const items = [...streets, ...areas].toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return {
    source: data.attribution,
    bbox: bbox([...data.streets.flatMap((s) => s.lines.flat()), ...data.areas.flatMap((a) => a.polygons.flat(2))]),
    items,
    station: lngLat(data.station),
  }
}

/** One line per street with sections, for the console. */
export function summary(town: Town): string {
  const long = town.items.filter((i) => i.sections.length)
  const areas = town.items.filter((i) => i.kind === 'area').length
  const ends = town.items.filter((i) => i.ends).length
  return [
    `${town.items.length} items (${areas} areas), ${long.length} with sections, ${ends} with numbering ends`,
    ...long.map(
      (i) => `  ${i.name}: ${i.sections.map((s) => `${s.from}–${s.to} ${s.crossStreets.join('/')}`).join(' | ')}`,
    ),
  ].join('\n')
}
