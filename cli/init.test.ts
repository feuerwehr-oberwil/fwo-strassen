import { type } from 'arktype'
import { describe, expect, it } from 'vitest'
import type { Municipality } from '../pipeline/sources/swisstopo.ts'
import { Region } from '../src/region.ts'
import { findAddress, matchMunicipalities, newRegion } from './init.ts'

const LIST: Municipality[] = [
  { bfs: 2762, name: 'Allschwil', canton: 'BL' },
  { bfs: 2771, name: 'Oberwil (BL)', canton: 'BL' },
  { bfs: 391, name: 'Oberwil bei Büren', canton: 'BE' },
  { bfs: 4074, name: 'Oberwil-Lieli', canton: 'AG' },
  { bfs: 261, name: 'Zürich', canton: 'ZH' },
]
const names = (query: string) => matchMunicipalities(LIST, query).map((m) => m.name)

describe('matchMunicipalities', () => {
  it('finds a BFS number', () => expect(names('2771')).toEqual(['Oberwil (BL)']))
  it('takes an exact name alone, ignoring case and accents', () => expect(names('zurich')).toEqual(['Zürich']))
  it('offers every name starting with an ambiguous query', () =>
    expect(names('Oberwil')).toEqual(['Oberwil (BL)', 'Oberwil bei Büren', 'Oberwil-Lieli']))
  it('falls back to names containing the query', () => expect(names('lieli')).toEqual(['Oberwil-Lieli']))
  it('finds nothing for an unknown number', () => expect(names('9999')).toEqual([]))
})

describe('findAddress', () => {
  const book = new Map([
    ['Löchlimattstrasse', ['1', '4', '6a']],
    ['Hauptstrasse', ['10']],
  ])
  it('returns the register spelling', () =>
    expect(findAddress(book, 'löchlimattstrasse 6A')).toEqual({ street: 'Löchlimattstrasse', number: '6a' }))
  it('lists the numbers when the number is wrong', () =>
    expect(findAddress(book, 'Löchlimattstrasse 3')).toEqual({
      error: 'Löchlimattstrasse has no number 3 – it has 1, 4, 6a',
    }))
  it('suggests streets when the street is unknown', () =>
    expect(findAddress(book, 'Löchlimattweg 1')).toMatchObject({ error: expect.stringContaining('Löchlimattstrasse') }))
  it('needs a number', () => expect(findAddress(book, 'Hauptstrasse')).toHaveProperty('error'))
})

it('newRegion writes a valid region.json with the short town name', () => {
  const region = newRegion(LIST[1]!, { street: 'Löchlimattstrasse', number: '1' }, 'de', 'Feuerwehr Oberwil')
  expect(Region(region)).not.toBeInstanceOf(type.errors)
  expect(region).toMatchObject({ name: 'Oberwil', source: { type: 'swisstopo', bfs: 2771 } })
})
