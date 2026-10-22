import { describe, expect, it } from 'vitest'
import { hasNewer, normaliseName, profileKey } from './backup'

describe('profileKey', () => {
  it('is the same for the same person however the name is typed', async () => {
    const key = await profileKey('Oberwil', 'Basti', '1234')
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(await profileKey('Oberwil', '  BASTI ', '1234')).toBe(key)
    expect(normaliseName('Anna  Maria')).toBe(normaliseName('anna maria'))
  })

  it('differs by PIN and by town', async () => {
    const key = await profileKey('Oberwil', 'Basti', '1234')
    expect(await profileKey('Oberwil', 'Basti', '1235')).not.toBe(key)
    expect(await profileKey('Allschwil', 'Basti', '1234')).not.toBe(key)
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
