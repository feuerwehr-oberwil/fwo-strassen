import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createInterface, type Interface } from 'node:readline/promises'
import { addressBook, municipalities, type Municipality } from '../pipeline/sources/swisstopo.ts'
import { Region } from '../src/region.ts'

// `strassen-trainer init <dir>`: asks for the municipality, the station address, language and
// brand (or takes them from flags), checks them against swisstopo's registers and writes
// <dir>/region.json. The register downloads land in <dir>/.cache, where `data` reuses them.

export type InitAnswers = { municipality?: string; station?: string; language?: string; brand?: string }

const LANGUAGES = ['de', 'fr', 'en'] as const satisfies readonly Region['language'][]
const isLanguage = (l: string): l is Region['language'] => LANGUAGES.some((x) => x === l)

/** Case and accents don't matter: «zurich» finds «Zürich». */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

/**
 * Municipalities matching what someone typed: a BFS number, or a name. An exact name wins alone;
 * otherwise every name that starts with the query («Oberwil» → four of them), or else contains it.
 */
export function matchMunicipalities(list: Municipality[], query: string): Municipality[] {
  const q = fold(query)
  if (/^\d+$/.test(q)) return list.filter((m) => m.bfs === Number(q))
  const exact = list.filter((m) => fold(m.name) === q)
  if (exact.length) return exact
  const starts = list.filter((m) => fold(m.name).startsWith(q))
  return starts.length ? starts : list.filter((m) => fold(m.name).includes(q))
}

/** The town name for the app title: «Oberwil (BL)» → «Oberwil». */
export const townName = (m: Municipality) => m.name.replace(/\s*\([A-Z]{2}\)$/, '')

/** «Allschwil (BL), BFS 2762»; names like «Oberwil (BL)» carry their canton already. */
const label = (m: Municipality) => `${/\([A-Z]{2}\)$/.test(m.name) ? m.name : `${m.name} (${m.canton})`}, BFS ${m.bfs}`

/** French-speaking cantons default to French, the rest to German. */
export const defaultLanguage = (m: Municipality): Region['language'] =>
  ['GE', 'VD', 'NE', 'JU'].includes(m.canton) ? 'fr' : 'de'

/**
 * Checks «street number» against the town's addresses (street name as in `addressBook`). Returns
 * the address as the register spells it, or an error with hints.
 */
export function findAddress(
  book: Map<string, string[]>,
  input: string,
): { street: string; number: string } | { error: string } {
  const match = /^(.*\S)\s+(\d\S*)$/.exec(input.trim())
  if (!match) return { error: 'expected «street number», e.g. «Löchlimattstrasse 1»' }
  const [, typed = '', number = ''] = match
  const street = [...book.keys()].find((s) => fold(s) === fold(typed))
  if (!street) {
    const similar = [...book.keys()].filter((s) => fold(s).includes(fold(typed).slice(0, 5))).slice(0, 8)
    return {
      error: `no street «${typed}» in the address register${similar.length ? ` – maybe ${similar.join(', ')}?` : ''}`,
    }
  }
  const numbers = book.get(street) ?? []
  const found = numbers.find((n) => fold(n) === fold(number))
  if (found) return { street, number: found }
  const sorted = numbers.toSorted((a, b) => a.localeCompare(b, 'de', { numeric: true }))
  return { error: `${street} has no number ${number} – it has ${sorted.slice(0, 30).join(', ')}` }
}

/** region.json for a new town: no route fixes yet. */
export function newRegion(
  municipality: Municipality,
  station: { street: string; number: string },
  language: Region['language'],
  brand: string,
): Region {
  return {
    name: townName(municipality),
    brand,
    language,
    source: { type: 'swisstopo', bfs: municipality.bfs },
    station,
    fixes: { barriers: [], accessRoads: [] },
  }
}

/**
 * Asks until `parse` accepts an answer. With a flag value, parses that once instead and throws
 * when it doesn't fit, so scripted runs never hang on a prompt.
 */
async function answer<T>(
  rl: Interface,
  prompt: string,
  given: string | undefined,
  parse: (input: string) => T | { error: string },
): Promise<T> {
  for (;;) {
    const input = given ?? (await rl.question(prompt))
    const result = parse(input)
    if (!(typeof result === 'object' && result && 'error' in result)) return result
    if (given !== undefined) throw new Error(result.error)
    console.log(`  ${result.error}`)
  }
}

export async function init(dir: string, given: InitAnswers): Promise<void> {
  const file = join(dir, 'region.json')
  if (existsSync(file)) throw new Error(`${file} exists already – edit it, or pick another folder`)
  const cache = join(dir, '.cache')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    console.log('Loading the municipalities (the first run downloads swisstopo’s street register, ~7 MB) …')
    const list = await municipalities(cache)
    const municipality = await answer(rl, 'Municipality (name or BFS number): ', given.municipality, (input) => {
      const found = matchMunicipalities(list, input)
      if (found.length === 1) return found[0]!
      if (!found.length) return { error: `no Swiss municipality matches «${input}»` }
      const shown = found.slice(0, 15).map(label)
      return { error: `several match – type the full name or the BFS number:\n    ${shown.join('\n    ')}` }
    })
    console.log(`→ ${label(municipality)}`)

    console.log('Loading its addresses (the first run downloads swisstopo’s address register, ~140 MB) …')
    const book = await addressBook(cache, municipality.bfs)
    const station = await answer(rl, 'Station address (street and number): ', given.station, (input) =>
      findAddress(book, input),
    )
    const lang = defaultLanguage(municipality)
    const language = await answer(rl, `Language – de, fr or en [${lang}]: `, given.language, (input) => {
      const l = input.trim() || lang
      return isLanguage(l) ? l : { error: 'de, fr or en' }
    })
    const fallbackBrand = `Feuerwehr ${townName(municipality)}`
    const brand = await answer(
      rl,
      `Brand shown above the title [${fallbackBrand}]: `,
      given.brand,
      (input) => input.trim() || fallbackBrand,
    )

    const region = Region.assert(newRegion(municipality, station, language, brand))
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, `${JSON.stringify(region, null, 2)}\n`)
    console.log(
      `\nWrote ${relative('.', file)}. Next:\n  cd ${relative('.', dir)}\n  npx strassen-trainer data\n  npx strassen-trainer build`,
    )
  } finally {
    rl.close()
  }
}
