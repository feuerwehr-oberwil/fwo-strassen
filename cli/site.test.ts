import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, it } from 'vitest'
import type { Region } from '../src/region.ts'
import { buildSite } from './site.ts'

const region: Region = {
  name: 'Binningen',
  brand: 'Feuerwehr <Binningen>',
  language: 'fr',
  source: { type: 'swisstopo', bfs: 2765 },
  station: { street: 'Hauptstrasse', number: '1' },
  axes: [],
  fixes: { barriers: [], accessRoads: [] },
}

let root = ''
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'strassen-site-'))
  mkdirSync(join(root, 'app'))
  writeFileSync(
    join(root, 'app', 'index.html'),
    '<html lang="%LANG%"><meta name="strassen-data" content="%DATA%"><title>%TITLE%</title></html>',
  )
  mkdirSync(join(root, 'town', 'data'), { recursive: true })
  for (const name of ['town', 'routes', 'basemap'])
    writeFileSync(join(root, 'town', 'data', `${name}.json`), '{ "a": 1 }')
})
const build = (out = join(root, 'town', 'dist')) =>
  buildSite({ region, app: join(root, 'app'), data: join(root, 'town', 'data'), out })

it('writes the data to a content-hashed directory that index.html names', () => {
  const dir = build()
  const dist = join(root, 'town', 'dist')
  expect(dir).toMatch(/^data\/[0-9a-f]{10}$/)
  expect(readFileSync(join(dist, 'index.html'), 'utf8')).toBe(
    `<html lang="fr"><meta name="strassen-data" content="./${dir}/"><title>Quiz des rues de Binningen</title></html>`,
  )
  expect(JSON.parse(readFileSync(join(dist, dir, 'config.json'), 'utf8'))).toEqual({
    name: 'Binningen',
    brand: 'Feuerwehr <Binningen>',
    language: 'fr',
  })
  expect(readFileSync(join(dist, dir, 'town.json'), 'utf8')).toBe('{"a":1}')
  expect(build()).toBe(dir) // same input, same directory
})

it('changes the directory when the data changes', () => {
  const before = build()
  writeFileSync(join(root, 'town', 'data', 'routes.json'), '{ "a": 2 }')
  expect(build()).not.toBe(before)
})

it('never replaces the town folder itself', () => {
  expect(() => build(join(root, 'town'))).toThrow()
  expect(readFileSync(join(root, 'town', 'data', 'town.json'), 'utf8')).toBe('{ "a": 1 }')
})
