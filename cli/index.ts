#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { buildData, STEPS, type Step } from '../pipeline/index.ts'
import { init } from './init.ts'
import { readRegion } from './region.ts'
import { buildSite } from './site.ts'

// `strassen-trainer`: set up a town, build its data, write the static app. Run from source here
// (`node cli/index.ts`, type stripping) and as compiled JS from the npm package (cli-dist/, since
// Node doesn't strip types under node_modules).

const HELP = `strassen-trainer – learn the streets of your town, for fire brigade drivers

  strassen-trainer init <folder>   set up a town: asks for municipality, station address,
                                   language and brand, writes <folder>/region.json
  strassen-trainer data [step…]    download and build the town data into ./data
                                   (steps: ${STEPS.join(', ')}; default all)
  strassen-trainer build           write the app with this town's data to ./dist (static, host anywhere)

Options
  --region <file>   region file (default region.json)
  --data <dir>      town data (default data)
  --cache <dir>     downloads kept between runs (default .cache)
  --out <dir>       build output (default dist)
  init only: --municipality <name|BFS> --station "<street> <number>" --language <de|fr|en> --brand <text>
`

/** The package root (where package.json and the prebuilt app/ are), from cli/ or cli-dist/cli/. */
function packageRoot(dir = import.meta.dirname): string {
  if (existsSync(join(dir, 'package.json'))) return dir
  if (dirname(dir) === dir) throw new Error('package.json not found')
  return packageRoot(dirname(dir))
}

const isStep = (s: string): s is Step => STEPS.some((x) => x === s)

async function main() {
  const { values: flags, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      region: { type: 'string', default: 'region.json' },
      data: { type: 'string', default: 'data' },
      cache: { type: 'string', default: '.cache' },
      out: { type: 'string', default: 'dist' },
      municipality: { type: 'string' },
      station: { type: 'string' },
      language: { type: 'string' },
      brand: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  })
  const [command, ...args] = positionals
  if (flags.help) return console.log(HELP)
  if (flags.version) {
    const pkg: { version: string } = JSON.parse(readFileSync(join(packageRoot(), 'package.json'), 'utf8'))
    return console.log(pkg.version)
  }
  switch (command) {
    case 'init': {
      const [dir] = args
      if (!dir) throw new Error('usage: strassen-trainer init <folder>')
      return init(resolve(dir), flags)
    }
    case 'data': {
      const unknown = args.filter((s) => !isStep(s))
      if (unknown.length) throw new Error(`unknown step ${unknown.join(', ')} – steps: ${STEPS.join(', ')}`)
      const started = performance.now()
      await buildData(readRegion(resolve(flags.region)), {
        data: resolve(flags.data),
        cache: resolve(flags.cache),
        steps: args.filter(isStep),
      })
      return console.log(`done in ${((performance.now() - started) / 1000).toFixed(1)} s`)
    }
    case 'build': {
      const out = resolve(flags.out)
      const dir = buildSite({
        region: readRegion(resolve(flags.region)),
        app: join(packageRoot(), 'app'),
        data: resolve(flags.data),
        out,
      })
      return console.log(`→ ${out} (data in ${dir}) – upload it to any static host`)
    }
    // `serve` (app and progress backup in one Node process) comes with the backup server in server/.
    case undefined:
      return console.log(HELP)
    default:
      throw new Error(`unknown command «${command}»\n\n${HELP}`)
  }
}

await main().catch((error: unknown) => {
  console.error(`strassen-trainer: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
