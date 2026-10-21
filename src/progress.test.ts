import { describe, expect, it } from 'vitest'
import { INTERVALS, pickNext, review, type Cards } from './progress'

describe('review', () => {
  it('moves a right answer up one box and a wrong one back to box 0', () => {
    expect(review(undefined, true, 0)).toEqual({ box: 1, due: INTERVALS[1] })
    expect(review({ box: 4, due: 0 }, false, 100)).toEqual({ box: 0, due: 100 + INTERVALS[0] })
  })

  it('stops at the last box', () => {
    expect(review({ box: 5, due: 0 }, true, 0).box).toBe(5)
  })
})

describe('pickNext', () => {
  const keys = ['a', 'b', 'c']

  it('asks overdue cards before new ones, lowest box first', () => {
    const cards: Cards = { b: { box: 2, due: 5 }, c: { box: 0, due: 8 } }
    expect(pickNext(keys, cards, 10)).toBe('c')
  })

  it('takes new keys in order when nothing is due', () => {
    expect(pickNext(keys, { a: { box: 1, due: 99 } }, 10)).toBe('b')
  })

  it('falls back to the soonest due card and never repeats the last one', () => {
    const cards: Cards = { a: { box: 1, due: 50 }, b: { box: 1, due: 20 }, c: { box: 1, due: 30 } }
    expect(pickNext(keys, cards, 10)).toBe('b')
    expect(pickNext(keys, cards, 10, 'b')).toBe('c')
  })
})
