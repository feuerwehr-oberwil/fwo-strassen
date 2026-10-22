import { describe, expect, it } from 'vitest'
import type { Cards } from './progress'
import { INTRO_BATCH, isCorrect, makeQuestion, pickRound, planRound, roundKeys } from './round'
import type { Item } from './town'

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

describe('house numbers', () => {
  const item = (id: string, extra: Partial<Item>): Item => ({
    id,
    name: id,
    kind: 'street',
    lengthM: 100,
    center: [0, 0],
    bbox: [0, 0, 0, 0],
    geometry: { type: 'LineString', coordinates: [] },
    sections: [],
    ...extra,
  })
  const long = item('long', {
    sections: [{ from: 1, to: 9, crossStreets: [], geometry: { type: 'LineString', coordinates: [] } }],
  })
  const short = item('short', { ends: { from: 1, to: 42, low: [0, 0], high: [1, 1] } })
  const plain = item('plain', {})

  it('asks sections of long streets and where the numbering starts on shorter ones', () => {
    expect(roundKeys('find', [long, short, plain], true)).toEqual([
      'find:long',
      'nr:long:1-9',
      'find:short',
      'start:short',
      'find:plain',
    ])
    expect(roundKeys('find', [long, short, plain], false)).toEqual(['find:long', 'find:short', 'find:plain'])
  })

  it('finds a section by its range, so a re-split street never inherits old cards', () => {
    const q = makeQuestion('nr:long:1-9', [long])
    expect(q.kind === 'section' && q.section).toBe(0)
    expect(makeQuestion('nr:long:0', [long]).kind).toBe('find') // an index key from before
  })

  it('counts the low end as the right answer to «Wo ist Nr. 1?»', () => {
    const q = makeQuestion('start:short', [short])
    expect(q.kind).toBe('start')
    if (q.kind !== 'start') return
    expect([isCorrect(q, 0), isCorrect(q, 1)]).toEqual([true, false])
  })
})
