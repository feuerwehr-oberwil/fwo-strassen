import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Region } from '../src/region.ts'
import type { Town } from '../src/town.ts'
import { basemap } from './basemap.ts'
import { routes, summary as routeSummary } from './routes.ts'
import type { SourceData } from './source.ts'
import { LV95, swisstopo } from './sources/swisstopo.ts'
import { buildTown, summary as townSummary } from './town.ts'

// The data pipeline, run by `strassen-trainer data` (`pnpm data` in this repo): builds town.json,
// routes.json and basemap.json for a region into a data directory. Single steps (town, routes,
// basemap) can run alone; routes and basemap read the town.json already there.

/** Data sources by region.json `source.type`: how to load a town, and the metric CRS it uses. */
const SOURCES = {
  swisstopo: { load: swisstopo, crs: LV95 },
} satisfies Record<Region['source']['type'], { load: (r: Region, cache: string) => Promise<SourceData>; crs: string }>

export const STEPS = ['town', 'routes', 'basemap'] as const
export type Step = (typeof STEPS)[number]

/** `data`: where the JSON goes; `cache`: downloads kept between runs; `steps`: all when empty. */
export type PipelineOptions = { data: string; cache: string; steps: readonly Step[] }

export async function buildData(region: Region, { data, cache, steps }: PipelineOptions): Promise<void> {
  const source = SOURCES[region.source.type]
  const run = (step: Step) => !steps.length || steps.includes(step)
  const readTown = (): Town => JSON.parse(readFileSync(join(data, 'town.json'), 'utf8'))
  mkdirSync(data, { recursive: true })

  if (run('town')) {
    const town = buildTown(await source.load(region, cache), region.axes)
    await write(join(data, 'town.json'), JSON.stringify(town))
    console.log(townSummary(town))
  }
  if (run('routes')) {
    const town = readTown()
    const r = await routes(town, region, source.crs, cache)
    const entries = [...r.routes].map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`)
    await write(join(data, 'routes.json'), `{${entries.join(',')}}`)
    console.log(`${r.routes.size} routes\n${routeSummary(town, r)}`)
  }
  if (run('basemap')) {
    const style = await basemap(readTown(), region.name)
    await write(join(data, 'basemap.json'), JSON.stringify(style))
    console.log(`${style.layers.length} layers`)
  }
}

/**
 * Writes `json` (`JSON.stringify` keeps the object's key order). Where prettier and a prettier
 * config are around – this repo, whose data is committed – it is formatted, so diffs stay
 * readable; the published CLI doesn't depend on prettier and writes it compact.
 */
async function write(path: string, json: string) {
  const prettier = await import('prettier').catch(() => null)
  const options = await prettier?.resolveConfig(path)
  writeFileSync(path, prettier && options ? await prettier.format(json, { ...options, filepath: path }) : json)
  console.log(`→ ${path} (${Math.round(statSync(path).size / 1024)} KB)`)
}
