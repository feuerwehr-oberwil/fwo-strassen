// Planar geometry in a metric CRS (LV95 for swisstopo). Small, dependency-free versions of the
// GEOS operations the pipeline needs; where GEOS has a specific rule (ties, interior points,
// substring ends) it is followed, so results match the former shapely pipeline.

export type XY = [x: number, y: number]
export type Line = XY[]
/** Rings: outer first, then holes. */
export type Polygon = Line[]

export const distance = (a: XY, b: XY) => Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)

export const lineLength = (line: Line) => line.slice(1).reduce((sum, p, i) => sum + distance(line[i]!, p), 0)

/** Distance from `p` to the segment a–b. */
export function pointSegmentDistance(p: XY, a: XY, b: XY): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return distance(p, a)
  const r = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2
  if (r <= 0) return distance(p, a)
  if (r >= 1) return distance(p, b)
  return Math.abs(((a[1] - p[1]) * dx - (a[0] - p[0]) * dy) / len2) * Math.sqrt(len2)
}

const segments = (lines: Line[]) => lines.flatMap((l) => l.slice(1).map((q, i): [XY, XY] => [l[i]!, q]))

/** Shortest distance from `p` to any of `lines`. */
export const pointLinesDistance = (p: XY, lines: Line[]) =>
  Math.min(...segments(lines).map(([a, b]) => pointSegmentDistance(p, a, b)))

const orientation = (a: XY, b: XY, c: XY) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))

function segmentsIntersect(a: XY, b: XY, c: XY, d: XY): boolean {
  const [o1, o2, o3, o4] = [orientation(a, b, c), orientation(a, b, d), orientation(c, d, a), orientation(c, d, b)]
  if (o1 !== o2 && o3 !== o4) return true
  const onSegment = (p: XY, q: XY, r: XY) =>
    Math.min(p[0], q[0]) <= r[0] &&
    r[0] <= Math.max(p[0], q[0]) &&
    Math.min(p[1], q[1]) <= r[1] &&
    r[1] <= Math.max(p[1], q[1])
  return (
    (o1 === 0 && onSegment(a, b, c)) ||
    (o2 === 0 && onSegment(a, b, d)) ||
    (o3 === 0 && onSegment(c, d, a)) ||
    (o4 === 0 && onSegment(c, d, b))
  )
}

/** Shortest distance between two sets of lines (0 where they cross). */
export function linesDistance(a: Line[], b: Line[]): number {
  let min = Infinity
  const sb = segments(b)
  for (const [p, q] of segments(a))
    for (const [r, s] of sb) {
      if (segmentsIntersect(p, q, r, s)) return 0
      min = Math.min(
        min,
        pointSegmentDistance(p, r, s),
        pointSegmentDistance(q, r, s),
        pointSegmentDistance(r, p, q),
        pointSegmentDistance(s, p, q),
      )
    }
  return min
}

/** Whether `p` lies inside the polygon (even-odd over all rings). */
export function inPolygon(p: XY, polygon: Polygon): boolean {
  let inside = false
  for (const ring of polygon)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [a, b] = [ring[i]!, ring[j]!]
      if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
    }
  return inside
}

/** How far along `line` the point closest to `p` is (GEOS `project`; the first of equally close wins). */
export function project(line: Line, p: XY): number {
  let [best, measure, start] = [Infinity, 0, 0]
  for (const [a, b] of segments([line])) {
    const len = distance(a, b)
    const d = pointSegmentDistance(p, a, b)
    if (d < best) {
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
      const r = len === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)
      measure = start + Math.min(1, Math.max(0, r)) * len
      best = d
    }
    start += len
  }
  return measure
}

/** The point `at` metres along `line`, clamped to its ends. */
export function interpolate(line: Line, at: number): XY {
  if (at <= 0) return line[0]!
  let total = 0
  for (const [a, b] of segments([line])) {
    const len = distance(a, b)
    if (total + len > at) {
      const f = (at - total) / len
      return f <= 0 ? a : [(b[0] - a[0]) * f + a[0], (b[1] - a[1]) * f + a[1]]
    }
    total += len
  }
  return line.at(-1)!
}

/** The piece of `line` from `start` to `end` metres along it (start < end), like shapely's `substring`. */
export function substring(line: Line, start: number, end: number): Line {
  const out = [interpolate(line, start)]
  const from = Math.max(start, 0)
  let along = 0
  for (const [a, b] of segments([line])) {
    if (from < along && along < end) out.push(a)
    else if (along >= end) break
    along += distance(a, b)
  }
  out.push(interpolate(line, end))
  return out
}

/** Length-weighted centre of some lines (GEOS centroid). */
export function centroid(lines: Line[]): XY {
  let [sx, sy, total] = [0, 0, 0]
  for (const [a, b] of segments(lines)) {
    const len = distance(a, b)
    sx += len * ((a[0] + b[0]) / 2)
    sy += len * ((a[1] + b[1]) / 2)
    total += len
  }
  return total > 0 ? [sx / total, sy / total] : lines[0]![0]!
}

/** A point on the lines near their middle: the inner vertex closest to the centroid (GEOS InteriorPointLine). */
export function linePoint(lines: Line[]): XY {
  const c = centroid(lines)
  const closest = (points: XY[]) =>
    points.reduce<XY | undefined>((best, p) => (!best || distance(p, c) < distance(best, c) ? p : best), undefined)
  return closest(lines.flatMap((l) => l.slice(1, -1))) ?? closest(lines.flatMap((l) => [l[0]!, l.at(-1)!]))!
}

/**
 * A point inside the polygons (GEOS InteriorPointArea): the middle of the widest interior
 * stretch of a horizontal line through the polygon, placed between two vertex heights.
 */
export function areaPoint(polygons: Polygon[]): XY {
  let [best, bestWidth]: [XY, number] = [polygons[0]![0]![0]!, -1]
  for (const polygon of polygons) {
    const ys = polygon.flat().map((p) => p[1])
    const [minY, maxY] = [Math.min(...ys), Math.max(...ys)]
    const centre = (minY + maxY) / 2
    let [lo, hi] = [minY, maxY]
    for (const y of ys) {
      if (y <= centre) lo = Math.max(lo, y)
      else hi = Math.min(hi, y)
    }
    const scanY = (lo + hi) / 2
    const crossings: number[] = []
    for (const [a, b] of segments(polygon)) {
      if ((a[1] > scanY && b[1] > scanY) || (a[1] < scanY && b[1] < scanY) || a[1] === b[1]) continue
      if ((a[1] === scanY && b[1] < scanY) || (b[1] === scanY && a[1] < scanY)) continue
      crossings.push(a[0] === b[0] ? a[0] : a[0] + (scanY - a[1]) / ((b[1] - a[1]) / (b[0] - a[0])))
    }
    crossings.sort((a, b) => a - b)
    let [point, width]: [XY, number] = [polygon[0]![0]!, 0]
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const w = crossings[i + 1]! - crossings[i]!
      if (w > width) [point, width] = [[(crossings[i]! + crossings[i + 1]!) / 2, scanY], w]
    }
    if (width > bestWidth) [best, bestWidth] = [point, width]
  }
  return best
}

/**
 * Douglas-Peucker: drops vertices closer than `tolerance` to the simplified line. Rings keep at
 * least 4 points. Unlike GEOS' topology-preserving variant it doesn't check for new crossings.
 */
export function simplify(line: Line, tolerance: number): Line {
  const minSize = line.length > 3 && distance(line[0]!, line.at(-1)!) === 0 ? 4 : 2
  const keep = new Set([0, line.length - 1])
  let resultSegments = 0
  const section = (i: number, j: number, depth: number): void => {
    if (i + 1 === j) return void resultSegments++
    let [far, max] = [i, -1]
    for (let k = i + 1; k < j; k++) {
      const d = pointSegmentDistance(line[k]!, line[i]!, line[j]!)
      if (d > max) [far, max] = [k, d]
    }
    const tooFew = (resultSegments === 0 ? 0 : resultSegments + 1) < minSize && depth + 2 < minSize
    if (max <= tolerance && !tooFew) return void resultSegments++
    keep.add(far)
    section(i, far, depth + 1)
    section(far, j, depth + 1)
  }
  if (line.length > 2) section(0, line.length - 1, 0)
  return line.filter((_, i) => keep.has(i))
}

export type Bounds = [minX: number, minY: number, maxX: number, maxY: number]

export function bounds(points: XY[]): Bounds {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}
