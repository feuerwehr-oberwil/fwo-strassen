import { describe, expect, it } from 'vitest'
import type { Cards } from './progress'
import { pickRound } from './round'

const streets = (n: number) => Array.from({ length: n }, (_, i) => `find:s${i}`)

describe('pickRound', () => {
  it('asks overdue cards first, lowest box first, then new keys in order', () => {
    const keys = streets(5)
    const cards: Cards = { 'find:s3': { box: 2, due: 5 }, 'find:s4': { box: 0, due: 8 } }
    expect(pickRound(keys, cards, 10, 4)).toEqual(['find:s4', 'find:s3', 'find:s0', 'find:s1'])
  })

  it('leaves cards that are not due yet for last', () => {
    const keys = streets(3)
    const cards: Cards = { 'find:s0': { box: 3, due: 99 } }
    expect(pickRound(keys, cards, 10, 3)).toEqual(['find:s1', 'find:s2', 'find:s0'])
  })

  it('caps house-number questions per round and per street', () => {
    const keys = [
      'find:a',
      'nr:a:0',
      'nr:a:1',
      'nr:a:2',
      'find:b',
      'nr:b:0',
      'nr:b:1',
      'nr:b:2',
      'find:c',
      'nr:c:0',
      ...streets(10),
    ]
    const round = pickRound(keys, {}, 0, 10)
    const sections = round.filter((k) => k.startsWith('nr:'))
    expect(sections).toEqual(['nr:a:0', 'nr:a:1', 'nr:b:0', 'nr:b:1'])
    expect(round).toHaveLength(10)
  })

  it('drops the caps when the round cannot be filled otherwise', () => {
    const keys = ['find:a', 'nr:a:0', 'nr:a:1', 'nr:a:2']
    expect(pickRound(keys, {}, 0, 4)).toHaveLength(4)
  })
})
