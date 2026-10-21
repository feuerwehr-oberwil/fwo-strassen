import { describe, expect, it } from 'vitest'
import type { Cards } from './progress'
import { INTRO_BATCH, pickRound, planRound } from './round'

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

describe('planRound', () => {
  it('introduces new streets right before their questions and keeps every pick', () => {
    const picks = ['find:old', 'find:a', 'nr:a:0', 'find:b']
    const steps = planRound(picks, { 'find:old': { box: 2, due: 0 } }, true)
    expect(steps[0]).toBe('intro:a,b')
    expect(steps.slice(1).toSorted()).toEqual(picks.toSorted())
  })

  it('introduces many new streets in batches, each followed by its own questions', () => {
    const picks = streets(10)
    const steps = planRound(picks, {}, true)
    const intros = steps.filter((k) => k.startsWith('intro:'))
    expect(intros.map((k) => k.split(',').length)).toEqual([INTRO_BATCH, INTRO_BATCH, 2])
    // every street is asked after its intro, and before the next intro
    intros.forEach((intro, i) => {
      const from = steps.indexOf(intro)
      const to = i + 1 < intros.length ? steps.indexOf(intros[i + 1]!) : steps.length
      const asked = steps.slice(from + 1, to).map((k) => k.slice('find:'.length))
      expect(asked.toSorted()).toEqual(intro.slice('intro:'.length).split(',').toSorted())
    })
    expect(steps.filter((k) => k.startsWith('find:'))).toHaveLength(10)
  })

  it('asks everything straight away when introductions are off', () => {
    expect(planRound(['find:a', 'find:b'], {}, false).toSorted()).toEqual(['find:a', 'find:b'])
  })
})
