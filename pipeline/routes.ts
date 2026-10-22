import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import proj4 from 'proj4'
import type { Geometry, Position } from 'geojson'
import type { Region } from '../src/region.ts'
import { sectionKey, type LngLat, type Routes, type Town } from '../src/town.ts'
import {
  bounds,
  distance,
  inPolygon,
  lineLength,
  pointLinesDistance,
  simplify,
  type Bounds,
  type Line,
  type Polygon,
  type XY,
} from './geometry.ts'

// The truck route from the Feuerwehrmagazin to every street, house-number section and named area
// in town.json, on the OpenStreetMap road network (© OpenStreetMap contributors, ODbL) via
// Overpass, cached in the cache directory per town area.
//
// «Fastest for a large truck»: only roads a TLF can use, timed by road class, so big access roads
// win over cutting through neighbourhoods; every turn at a junction costs extra time, so of two
// similar routes the one with fewer turns wins. One-way streets are respected. A route ends where
// it first reaches the street (or the section, or the area).

const MARGIN = 0.01 // degrees of road network around the town (~1 km), for routes that leave town briefly

// km/h a loaded TLF realistically drives per OSM road class; anything missing is not drivable
const SPEED: Record<string, number> = {
  primary: 50,
  secondary: 50,
  tertiary: 40,
  unclassified: 30,
  residential: 25,
  living_street: 15,
  service: 12,
  pedestrian: 8,
  track: 8,
}
const SERVICE_SKIP = new Set(['parking_aisle', 'driveway', 'drive-through']) // too tight for a truck
const SLOW_ACCESS = new Set(['private', 'agricultural', 'forestry']) // passable in an emergency, but avoided
const SLOW_SPEED = 8
export const TURN_S = { right: 6, left: 10, sharp: 15 } // extra seconds per turn at a junction
const STRAIGHT_DEG = 30 // a direction change below this at a junction is going straight on
const TARGET_M = 25 // how close an OSM node must be to a street, section or area to count as on it
const ACCESS_M = 200 // footpaths and fields: the route ends at the nearest drivable point this close

// Barriers (gates, bollards, chains …) take too long to open, so no route passes one. These kinds
// don't stop a truck.
const OPEN_BARRIERS = new Set(['no', 'kerb', 'cattle_grid', 'border_control', 'toll_booth', 'entrance'])

type Tags = Record<string, string>
export type Osm = {
  elements: (
    | { type: 'node'; id: number; lon: number; lat: number; tags?: Tags }
    | { type: 'way'; id: number; nodes: number[]; tags: Tags }
  )[]
}

/** What the drivers know and OSM doesn't, from region.json `fixes`, plus the metric CRS to route in. */
export type Options = { crs: string; barriers: LngLat[]; accessRoads: string[] }

/** All highway ways in the bbox with their nodes, downloaded into `dir` once per area. */
async function overpass(bbox: Town['bbox'], brand: string, dir: string): Promise<Osm> {
  const [w, s, e, n] = [bbox[0] - MARGIN, bbox[1] - MARGIN, bbox[2] + MARGIN, bbox[3] + MARGIN].map((v) => v.toFixed(4))
  const cache = join(dir, `osm-roads-${w},${s},${e},${n}.json`)
  if (!existsSync(cache)) {
    const query = `[out:json][timeout:90];way[highway](${s},${w},${n},${e});(._;>;);out body;`
    console.log('downloading OSM roads …')
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: new URLSearchParams({ data: query }),
      headers: { 'User-Agent': `strassen-trainer-data/1.0 (${brand} street trainer)` },
    })
    if (!res.ok) throw new Error(`Overpass: HTTP ${res.status}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(cache, await res.text())
  }
  return JSON.parse(readFileSync(cache, 'utf8'))
}

/** km/h for a TLF on this way, or null when a truck can't or mustn't use it. */
function speed(tags: Tags, accessRoads: Set<string>): number | null {
  const kmh = SPEED[tags.highway ?? '']
  if (kmh === undefined || SERVICE_SKIP.has(tags.service ?? '')) return null
  const access = tags.motor_vehicle ?? tags.access ?? 'yes'
  if (access === 'no' && tags.emergency !== 'yes') return null
  if (SLOW_ACCESS.has(access)) return SLOW_SPEED
  return tags.name !== undefined && accessRoads.has(tags.name) ? Math.max(kmh, SPEED.tertiary!) : kmh
}

const bearing = (a: XY, b: XY) => (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI

/** Seconds for changing direction from bearing `before` to `after` at a junction. */
export function turnCost(before: number, after: number): number {
  const d = ((after - before + 540) % 360) - 180 // -180..180, positive = right
  if (Math.abs(d) < STRAIGHT_DEG) return 0
  if (Math.abs(d) > 135) return TURN_S.sharp
  return d > 0 ? TURN_S.right : TURN_S.left
}

/** Min-heap of [cost, previous node, node], ordered like Python tuples so ties pop the same way. */
class Heap {
  private items: [number, number, number][] = []
  get size() {
    return this.items.length
  }
  private less(i: number, j: number) {
    const [a, b] = [this.items[i]!, this.items[j]!]
    return a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2]
  }
  private swap(i: number, j: number) {
    ;[this.items[i], this.items[j]] = [this.items[j]!, this.items[i]!]
  }
  push(item: [number, number, number]) {
    this.items.push(item)
    for (let i = this.items.length - 1; i > 0 && this.less(i, (i - 1) >> 1); i = (i - 1) >> 1)
      this.swap(i, (i - 1) >> 1)
  }
  pop(): [number, number, number] {
    const top = this.items[0]!
    const last = this.items.pop()!
    if (this.items.length) {
      this.items[0] = last
      for (let i = 0; ;) {
        const [l, r] = [2 * i + 1, 2 * i + 2]
        let m = i
        if (l < this.items.length && this.less(l, m)) m = l
        if (r < this.items.length && this.less(r, m)) m = r
        if (m === i) break
        this.swap(i, m)
        i = m
      }
    }
    return top
  }
}

/**
 * Directed road graph in metres: node -> [next node, seconds], plus the names of the drivable ways
 * through each node. Barrier nodes have no edges, so routes go around them.
 */
export function network(osm: Osm, options: Options) {
  const toMetric = proj4('WGS84', options.crs)
  const accessRoads = new Set(options.accessRoads)
  const xy = new Map<number, XY>()
  const lonlat = new Map<number, LngLat>()
  const barriers = new Set<number>()
  for (const el of osm.elements)
    if (el.type === 'node') {
      lonlat.set(el.id, [el.lon, el.lat])
      xy.set(el.id, toMetric.forward([el.lon, el.lat]))
      if (!OPEN_BARRIERS.has(el.tags?.barrier ?? 'no')) barriers.add(el.id)
    }
  const out = new Map<number, [next: number, secs: number][]>()
  const names = new Map<number, Set<string>>()
  const degree = new Map<number, number>()
  const edge = (a: number, b: number, secs: number) => {
    const edges = out.get(a)
    if (edges) edges.push([b, secs])
    else out.set(a, [[b, secs]])
  }
  for (const el of osm.elements) {
    if (el.type !== 'way') continue
    const kmh = speed(el.tags, accessRoads)
    if (kmh === null) continue
    const { tags, nodes } = el
    const oneway = tags.oneway ?? (tags.junction === 'roundabout' ? 'roundabout' : 'no')
    for (const [i, a] of nodes.slice(0, -1).entries()) {
      const b = nodes[i + 1]!
      const secs = distance(xy.get(a)!, xy.get(b)!) / (kmh / 3.6)
      if (oneway !== '-1') edge(a, b, secs)
      if (['no', 'false', '0', '-1'].includes(oneway)) edge(b, a, secs)
    }
    for (const n of nodes) {
      degree.set(n, (degree.get(n) ?? 0) + (n === nodes[0] || n === nodes.at(-1) ? 1 : 2))
      if (tags.name !== undefined) names.set(n, (names.get(n) ?? new Set()).add(tags.name))
    }
  }
  const junction = new Set([...degree].filter(([, d]) => d > 2).map(([n]) => n))
  const nearest = (p: XY) =>
    [...out.keys()].reduce((best, n) => (distance(xy.get(n)!, p) < distance(xy.get(best)!, p) ? n : best))
  for (const at of options.barriers) {
    const p = toMetric.forward(at)
    const n = nearest(p)
    if (distance(xy.get(n)!, p) < 30) barriers.add(n) // only on a road, not just anywhere
  }
  for (const n of barriers) out.delete(n)
  for (const [n, edges] of out)
    out.set(
      n,
      edges.filter(([b]) => !barriers.has(b)),
    )

  /**
   * Turn-aware Dijkstra from `start`. States are (previous node, node), so a turn's cost depends
   * on how you arrived. Returns the cheapest arrival cost per reached node and the path there.
   */
  function shortestTree(start: number) {
    // dense indices in OSM id order, so comparing indices compares ids (heap ties as in Python)
    const ids = [...xy.keys()].toSorted((a, b) => a - b)
    const index = new Map(ids.map((id, i) => [id, i]))
    const N = ids.length
    const key = (prev: number, node: number) => (prev + 1) * N + node
    const first = key(-1, index.get(start)!)
    const cost = new Map([[first, 0]])
    const parent = new Map<number, number>()
    const heap = new Heap()
    heap.push([0, -1, index.get(start)!])
    while (heap.size) {
      const [c, prev, node] = heap.pop()
      const state = key(prev, node)
      if (c > cost.get(state)!) continue
      for (const [nextId, secs] of out.get(ids[node]!) ?? []) {
        const next = index.get(nextId)!
        if (next === prev) continue // no U-turns
        let extra = 0
        if (prev !== -1 && junction.has(ids[node]!)) {
          const [p, q, r] = [xy.get(ids[prev]!)!, xy.get(ids[node]!)!, xy.get(nextId)!]
          extra = turnCost(bearing(p, q), bearing(q, r))
        }
        const s = key(node, next)
        if (c + secs + extra < (cost.get(s) ?? Infinity)) {
          cost.set(s, c + secs + extra)
          parent.set(s, state)
          heap.push([c + secs + extra, node, next])
        }
      }
    }
    const best = new Map<number, { cost: number; state: number }>() // node -> cheapest state arriving there
    for (const [state, c] of cost) {
      const node = ids[state % N]!
      if (c < (best.get(node)?.cost ?? Infinity)) best.set(node, { cost: c, state })
    }
    const path = (node: number): number[] => {
      const nodes = [node]
      for (let s: number | undefined = best.get(node)!.state; s !== undefined && s >= N; s = parent.get(s))
        nodes.push(ids[Math.floor(s / N) - 1]!)
      return nodes.reverse()
    }
    return { best, path }
  }

  return { xy, lonlat, names, nearest, shortestTree }
}

/** A GeoJSON target in metres, with the distance from any point to it (0 inside an area). */
function target(geometry: Geometry, toMetric: (p: Position) => XY) {
  const lines: Line[] = []
  const polygons: Polygon[] = []
  const points: XY[] = []
  if (geometry.type === 'Point') points.push(toMetric(geometry.coordinates))
  else if (geometry.type === 'LineString') lines.push(geometry.coordinates.map(toMetric))
  else if (geometry.type === 'MultiLineString') lines.push(...geometry.coordinates.map((l) => l.map(toMetric)))
  else if (geometry.type === 'Polygon') polygons.push(geometry.coordinates.map((r) => r.map(toMetric)))
  else if (geometry.type === 'MultiPolygon')
    polygons.push(...geometry.coordinates.map((p) => p.map((r) => r.map(toMetric))))
  const all = [...points, ...lines.flat(), ...polygons.flat(2)]
  const box: Bounds = bounds(all)
  const rings = polygons.flat()
  return {
    distance: (p: XY) =>
      polygons.some((poly) => inPolygon(p, poly))
        ? 0
        : Math.min(...points.map((q) => distance(p, q)), pointLinesDistance(p, [...lines, ...rings])),
    /** Whether `p` might be within `m` metres (cheap bbox test). */
    near: (p: XY, m: number) => p[0] >= box[0] - m && p[0] <= box[2] + m && p[1] >= box[1] - m && p[1] <= box[3] + m,
  }
}

/** Routes by key in the items' order (a plain object would sort the numeric keys first). */
export type RouteResult = {
  routes: Map<string, Routes[string]>
  missing: string[]
  substitute: string[]
  lengths: Map<string, number>
}

export function buildRoutes(town: Town, osm: Osm, options: Options): RouteResult {
  const toMetric = proj4('WGS84', options.crs)
  const net = network(osm, options)
  const { best, path: pathTo } = net.shortestTree(net.nearest(toMetric.forward(town.station)))
  const round5 = (v: number) => Number(v.toFixed(5))

  /**
   * The cheapest route to any reachable node on `geometry` (on a way called `name`, if given): its
   * lon/lat path, its length in metres, and whether it ends at a substitute point.
   */
  const routeTo = (geometry: Geometry, name: string | null) => {
    const g = target(geometry, (p) => toMetric.forward([p[0]!, p[1]!]))
    const on = [...best.keys()].filter((n) => g.near(net.xy.get(n)!, TARGET_M) && g.distance(net.xy.get(n)!) < TARGET_M)
    const named = on.filter((n) => name !== null && net.names.get(n)?.has(name))
    const cheapest = (nodes: number[]) => nodes.reduce((a, b) => (best.get(b)!.cost < best.get(a)!.cost ? b : a))
    let node: number
    if (named.length || on.length) node = cheapest(named.length ? named : on)
    else {
      // no truck gets onto it: the closest drivable point instead
      const dist = new Map([...best.keys()].map((n) => [n, g.distance(net.xy.get(n)!)]))
      node = [...best.keys()].reduce((a, b) => (dist.get(b)! < dist.get(a)! ? b : a))
      if (dist.get(node)! > ACCESS_M) return null
    }
    let path = pathTo(node)
    if (path.length > 1) {
      // thin out to ~2 m precision, keeping the original nodes
      const keep = new Set(
        simplify(
          path.map((n) => net.xy.get(n)!),
          2,
        ).map((p) => p.join()),
      )
      path = path.filter((n) => keep.has(net.xy.get(n)!.join()))
    }
    const metres = lineLength(path.map((n) => net.xy.get(n)!))
    const line = path.map((n): LngLat => {
      const [lon, lat] = net.lonlat.get(n)!
      return [round5(lon), round5(lat)]
    })
    return { line, metres, substitute: !(named.length || on.length) }
  }

  // keys: "<id>" for streets and areas, "<id>:<from>-<to>" for house-number sections and
  // "<id>:start" for the end where a shorter street's numbering starts
  const targets: [key: string, geometry: Geometry, name: string | null][] = []
  for (const item of town.items) {
    const name = item.kind === 'street' ? item.name : null
    targets.push([item.id, item.geometry, name])
    item.sections.forEach((s) => targets.push([`${item.id}:${sectionKey(s)}`, s.geometry, name]))
    if (item.ends) targets.push([`${item.id}:start`, { type: 'Point', coordinates: item.ends.low }, name])
  }
  const result: RouteResult = { routes: new Map(), missing: [], substitute: [], lengths: new Map() }
  for (const [key, geometry, name] of targets) {
    const r = routeTo(geometry, name)
    if (!r) {
      result.missing.push(key)
      continue
    }
    result.routes.set(key, r.line)
    result.lengths.set(key, r.metres)
    if (r.substitute) result.substitute.push(key)
  }
  return result
}

export async function routes(town: Town, region: Region, crs: string, cache: string): Promise<RouteResult> {
  const osm = await overpass(town.bbox, region.brand, cache)
  return buildRoutes(town, osm, {
    crs,
    barriers: region.fixes.barriers.map((b) => b.at),
    accessRoads: region.fixes.accessRoads,
  })
}

/** Console report: unreachable targets, substitute ends, longest routes. */
export function summary(town: Town, r: RouteResult): string {
  const names = new Map(town.items.map((i) => [i.id, i.name]))
  const label = (k: string) => {
    const [id, part] = k.split(':')
    return names.get(id!)! + (part === undefined ? '' : ` (${part})`)
  }
  const longest = [...r.lengths].toSorted((a, b) => b[1] - a[1]).slice(0, 5)
  return [
    `unreachable (${r.missing.length}): ${r.missing.map(label).join(', ') || '–'}`,
    `ending at the nearest drivable point (${r.substitute.length}): ${r.substitute.map(label).join(', ') || '–'}`,
    `longest: ${longest.map(([k, m]) => `${label(k)} ${m.toFixed(0)} m`).join(', ')}`,
  ].join('\n')
}
