import { describe, expect, it } from 'vitest'
import { INTERVALS, review } from './progress'

describe('review', () => {
  it('moves a right answer up one box and a wrong one back to box 0', () => {
    expect(review(undefined, true, 0)).toEqual({ box: 1, due: INTERVALS[1] })
    expect(review({ box: 4, due: 0 }, false, 100)).toEqual({ box: 0, due: 100 + INTERVALS[0] })
  })

  it('stops at the last box', () => {
    expect(review({ box: 5, due: 0 }, true, 0).box).toBe(5)
  })
})
