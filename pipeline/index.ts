import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type } from 'arktype'
import { format, resolveConfig } from 'prettier'
import { Region } from '../src/region.ts'
import type { Town } from '../src/town.ts'
import { basemap } from './basemap.ts'
import { routes, summary as routeSummary } from './routes.ts'
import type { SourceData } from './source.ts'
import { LV95, swisstopo } from './sources/swisstopo.ts'
import { buildTown, summary as townSummary } from './town.ts'

// The data pipeline: `pnpm data` builds src/data/town.json, routes.json and basemap.json for the
// town in region.json. `pnpm data routes` (or town, basemap) runs single steps; routes and basemap
// read the town.json already there.

const ROOT = join(import.meta.dirname, '..')
const DATA = join(ROOT, 'src', 'data')

/** Data sources by region.json `source.type`: how to load a town, and the metric CRS it uses. */
const SOURCES = {
  swisstopo: { load: swisstopo, crs: LV95 },
} satisfies Record<Region['source']['type'], { load: (r: Region) => Promise<SourceData>; crs: string }>

function loadRegion(): Region {
  const region = Region(JSON.parse(readFileSync(join(ROOT, 'region.json'), 'utf8')))
  if (region instanceof type.errors) {
    console.error(`region.json is invalid:\n${region.summary}`)
    process.exit(1)
  }
  return region
}

/** Writes `json` prettier-formatted, as committed. `JSON.stringify` keeps the object's key order. */
async function write(name: string, json: string) {
  const path = join(DATA, name)
  const options = await resolveConfig(path)
  writeFileSync(path, await format(json, { ...options, filepath: path }))
  console.log(`→ ${path} (${Math.round(statSync(path).size / 1024)} KB)`)
}

const readTown = (): Town => JSON.parse(readFileSync(join(DATA, 'town.json'), 'utf8'))

const region = loadRegion()
const source = SOURCES[region.source.type]
const steps = process.argv.slice(2)
const run = (step: string) => !steps.length || steps.includes(step)

if (run('town')) {
  const town = buildTown(await source.load(region))
  await write('town.json', JSON.stringify(town))
  console.log(townSummary(town))
}
if (run('routes')) {
  const town = readTown()
  const r = await routes(town, region, source.crs)
  const entries = [...r.routes].map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`)
  await write('routes.json', `{${entries.join(',')}}`)
  console.log(`${r.routes.size} routes\n${routeSummary(town, r)}`)
}
if (run('basemap')) {
  const style = await basemap(readTown(), region.name)
  await write('basemap.json', JSON.stringify(style))
  console.log(`${style.layers.length} layers`)
}
