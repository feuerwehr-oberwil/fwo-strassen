import type { Geometry } from 'geojson'
import { describe, expect, it } from 'vitest'
import { crossings, cutLine, distanceM, type Item } from './town'

const street = (geometry: Geometry): Item => ({
  id: 'x',
  name: 'x',
  kind: 'street',
  lengthM: null,
  center: [7.55, 47.52],
  bbox: [0, 0, 0, 0],
  geometry,
  sections: [],
})

describe('distanceM', () => {
  it('measures from a vertex to the middle of the other line, not just vertex to vertex', () => {
    // a long east–west line and a short one 0.001° (≈ 110 m) north of its middle
    const long = street({
      type: 'LineString',
      coordinates: [
        [7.54, 47.52],
        [7.56, 47.52],
      ],
    })
    const short = street({
      type: 'LineString',
      coordinates: [
        [7.55, 47.521],
        [7.5501, 47.521],
      ],
    })
    expect(distanceM(long, short)).toBeCloseTo(110.5, 0)
  })

  it('is zero for lines that share a point', () => {
    const a = street({
      type: 'LineString',
      coordinates: [
        [7.54, 47.52],
        [7.55, 47.52],
      ],
    })
    const b = street({
      type: 'LineString',
      coordinates: [
        [7.55, 47.52],
        [7.55, 47.53],
      ],
    })
    expect(distanceM(a, b)).toBe(0)
  })
})

describe('crossings', () => {
  const line = (id: string, coordinates: [number, number][], lengthM: number): Item => ({
    ...street({ type: 'LineString', coordinates }),
    id,
    name: id,
    lengthM,
  })
  // `main` runs east–west; `side` ends on it, `far` passes 110 m north, `area` touches but is no street
  const main = line(
    'main',
    [
      [7.54, 47.52],
      [7.56, 47.52],
    ],
    2000,
  )
  const side = line(
    'side',
    [
      [7.55, 47.52],
      [7.55, 47.525],
    ],
    500,
  )
  const longSide = line(
    'longSide',
    [
      [7.556, 47.52],
      [7.556, 47.53],
    ],
    1000,
  )
  const far = line(
    'far',
    [
      [7.54, 47.521],
      [7.56, 47.521],
    ],
    2000,
  )
  const area: Item = {
    ...line(
      'area',
      [
        [7.545, 47.52],
        [7.545, 47.523],
      ],
      300,
    ),
    kind: 'area',
  }

  it('names the streets touching a street, longest first, and leaves out areas and the street itself', () => {
    expect(crossings(main, [main, side, longSide, far, area]).map((i) => i.id)).toEqual(['longSide', 'side'])
  })
})

describe('cutLine', () => {
  const line: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
  ]

  it('stops partway along the right segment', () => {
    expect(cutLine(line, 0.25)).toEqual([
      [0, 0],
      [0.5, 0],
    ])
    expect(cutLine(line, 0.75)).toEqual([
      [0, 0],
      [1, 0],
      [1, 0.5],
    ])
  })

  it('gives the whole line at 1 and just the start at 0', () => {
    expect(cutLine(line, 1)).toEqual(line)
    expect(cutLine(line, 0)).toEqual([[0, 0]])
  })
})
