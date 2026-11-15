import { describe, expect, it } from 'vitest'
import type { Item, Section, Town } from '../src/town.ts'
import { townDiff, townDiffMarkdown } from './townDiff.ts'

const section = (from: number, to: number): Section => ({
  from,
  to,
  crossStreets: [],
  geometry: { type: 'LineString', coordinates: [] },
})
const item = (id: string, name: string, sections: Section[] = []): Item => ({
  id,
  name,
  kind: 'street',
  lengthM: 100,
  center: [0, 0],
  bbox: [0, 0, 0, 0],
  geometry: { type: 'LineString', coordinates: [] },
  sections,
})
const town = (items: Item[]): Town => ({
  source: '',
  sourceDate: '2026-11-15',
  generated: '2026-11-15',
  bbox: [0, 0, 0, 0],
  items,
  station: [0, 0],
})

describe('town diff', () => {
  it('lists the cards a refresh drops: removed items and moved range boundaries', () => {
    const before = town([
      item('1', 'Hohestrasse', [section(1, 99), section(100, 189)]),
      item('2', 'Gone'),
      item('3', 'Old name'),
    ])
    const after = town([
      item('1', 'Hohestrasse', [section(1, 99), section(100, 149), section(150, 189)]),
      item('3', 'New name'),
      item('4', 'Neuweg'),
    ])
    expect(townDiff(before, after)).toEqual({
      removed: ['Gone'],
      added: ['Neuweg'],
      renamed: ['Old name → New name'],
      ranges: [{ name: 'Hohestrasse', gone: ['100–189'], fresh: ['100–149', '150–189'] }],
      ends: [],
    })
  })

  it('says so when progress is unaffected', () => {
    const same = town([item('1', 'Hohestrasse', [section(1, 99)])])
    expect(townDiffMarkdown(same, same)).toMatch(/unaffected/)
  })
})
