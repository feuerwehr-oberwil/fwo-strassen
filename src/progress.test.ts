import { describe, expect, it } from 'vitest'
import { INTERVALS, mergeCards, progressCounts, review } from './progress'

describe('review', () => {
  it('fast-tracks a street that is right the very first time', () => {
    expect(review(undefined, true, 0)).toEqual({ box: 2, due: INTERVALS[2], at: 0 })
  })

  it('moves a right answer up one box and a wrong one back to box 0', () => {
    expect(review({ box: 1, due: 0 }, true, 5).box).toBe(2)
    expect(review({ box: 4, due: 0 }, false, 100)).toEqual({ box: 0, due: 100 + INTERVALS[0], at: 100 })
  })

  it('stops at the last box', () => {
    expect(review({ box: 5, due: 0 }, true, 0).box).toBe(5)
  })
})

describe('mergeCards', () => {
  it('keeps the card answered last, from either side', () => {
    const local = { a: { box: 3, due: 9, at: 5 }, b: { box: 1, due: 1, at: 1 } }
    const backup = { a: { box: 0, due: 7, at: 6 }, b: { box: 4, due: 2 }, c: { box: 2, due: 3, at: 2 } }
    expect(mergeCards(local, backup)).toEqual({ a: backup.a, b: local.b, c: backup.c })
  })
})

describe('progressCounts', () => {
  it('splits keys into solid, learning and new', () => {
    const cards = { a: { box: 3, due: 0 }, b: { box: 0, due: 0 } }
    expect(progressCounts(['a', 'b', 'c', 'd'], cards)).toEqual({ solid: 1, learning: 1, fresh: 2 })
  })
})
