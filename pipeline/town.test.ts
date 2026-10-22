import { describe, expect, it } from 'vitest'
import type { XY } from './geometry.ts'
import { houseNumber, numberingEnds, numberRanges, roundHalfEven, sectionCount, sectionGeometries } from './town.ts'

const xs = (values: number[], y: number) => values.map((x): XY => [x, y])

describe('house numbers', () => {
  it('parses suffixes', () => {
    expect(['12a', '31.1', '7', ''].map(houseNumber)).toEqual([12, 31, 7, null])
  })

  it('rounds halves to even like the Python pipeline did', () => {
    expect([2.5, 3.5, 2.4].map(roundHalfEven)).toEqual([2, 4, 2])
  })

  it('splits into contiguous, round ranges', () => {
    const nums = Array.from({ length: 200 }, (_, i) => i + 1)
    expect(numberRanges(nums, 4)).toEqual([
      [1, 49],
      [50, 99],
      [100, 149],
      [150, 200],
    ])
  })

  it('drops ranges that only cover a gap', () => {
    // numbers jump from 19 to 80, so no range may cover only the empty gap
    const nums = [...Array.from({ length: 19 }, (_, i) => i + 1), ...Array.from({ length: 40 }, (_, i) => i + 80)]
    const ranges = numberRanges(nums, 4)
    expect(ranges.every(([lo, hi]) => nums.some((n) => lo <= n && n <= hi))).toBe(true)
    expect([ranges[0]![0], ranges.at(-1)![1]]).toEqual([1, 119])
  })

  it('needs enough addresses for sections', () => {
    expect([sectionCount(2000, 10), sectionCount(600, 20), sectionCount(2900, 237)]).toEqual([0, 2, 5])
  })
})

describe('section geometries', () => {
  it('follow the address order and touch', () => {
    const line: XY[] = [
      [0, 0],
      [1000, 0],
    ]
    const [a, b] = sectionGeometries(
      [line],
      [xs([50, 100, 150, 200, 250, 300, 350, 400], 10), xs([550, 600, 650, 700, 750, 800, 850, 900], -10)],
    )
    const minX = (piece: XY[][]) => Math.min(...piece.flat().map((p) => p[0]))
    const maxX = (piece: XY[][]) => Math.max(...piece.flat().map((p) => p[0]))
    expect(minX(a!)).toBeLessThan(minX(b!))
    expect(Math.abs(maxX(a!) - minX(b!))).toBeLessThan(1) // neighbours meet halfway
  })
})

describe('numbering ends', () => {
  const line: XY[] = [
    [0, 0],
    [300, 0],
  ]
  const houses = xs([20, 90, 160, 230, 290], 5)

  it('follow the numbers', () => {
    const [low, high] = numberingEnds([line], houses, [9, 7, 5, 3, 1])! // numbers grow towards x = 0
    expect([low[0], high[0]]).toEqual([300, 0])
  })

  it('skip unclear streets', () => {
    expect(numberingEnds([line], houses, [1, 9, 3, 7, 5])).toBeNull() // jumbled
    expect(numberingEnds([line], houses.slice(0, 3), [1, 2, 3])).toBeNull() // too few houses
  })
})
