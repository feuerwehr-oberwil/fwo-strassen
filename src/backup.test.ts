import { describe, expect, it } from 'vitest'
import { CODE, hasNewer, newCode } from './backup'

describe('newCode', () => {
  it('makes codes the server accepts', () => {
    for (const r of [0, 0.5, 0.9999]) expect(newCode(() => r)).toMatch(CODE)
  })
})

describe('hasNewer', () => {
  it('is true only when the backup holds a card answered later', () => {
    const local = { a: { box: 1, due: 0, at: 5 } }
    expect(hasNewer(local, { a: { box: 0, due: 0, at: 4 } })).toBe(false)
    expect(hasNewer(local, { a: { box: 0, due: 0, at: 6 } })).toBe(true)
    expect(hasNewer(local, { b: { box: 0, due: 0, at: 1 } })).toBe(true)
  })
})
