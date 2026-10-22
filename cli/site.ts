import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { messages } from '../src/i18n/messages.ts'
import { publicConfig, type Region } from '../src/region.ts'

// The static site for one town: the prebuilt app (`vite build` → app/) plus the town's data, with
// index.html and the web manifest filled in for the region. Used by `strassen-trainer build` and,
// for index.html and the manifest, by the dev server (vite.config.ts).

/** The pipeline's output that the app loads (src/townData.ts), next to config.json. */
const DATA_FILES = ['town', 'routes', 'basemap'] as const

const escapeHtml = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

/** Fills index.html's %TITLE%, %SHORT_NAME%, %LANG% and %DATA% (the data directory URL). */
export function fillPage(html: string, region: Region, data: string): string {
  const page = messages[region.language].page
  return html
    .replaceAll('%TITLE%', escapeHtml(page.title(region.name)))
    .replaceAll('%SHORT_NAME%', escapeHtml(page.shortName))
    .replaceAll('%LANG%', region.language)
    .replaceAll('%DATA%', escapeHtml(data))
}

/** manifest.webmanifest for the region, in its language. */
export function manifest(region: Region): string {
  const page = messages[region.language].page
  return JSON.stringify({
    name: page.title(region.name),
    short_name: page.shortName,
    description: page.description(region.name, region.brand),
    lang: region.language,
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#f5f5f4',
    theme_color: '#f5f5f4',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  })
}

/** Where `buildSite` reads from and writes to. `out` is replaced. */
export type SiteOptions = { region: Region; app: string; data: string; out: string }

/**
 * Writes the site: the app, index.html and manifest for the region, and config.json plus the data
 * (minified) in data/<content hash>/, which index.html names – see src/townData.ts for why.
 * Returns the data directory, relative to `out`.
 */
export function buildSite({ region, app, data, out }: SiteOptions): string {
  if (!existsSync(join(app, 'index.html')))
    throw new Error(`no prebuilt app in ${app} – run \`vite build\` (or \`pnpm build\` in the repo) first`)
  const missing = DATA_FILES.filter((name) => !existsSync(join(data, `${name}.json`)))
  if (missing.length)
    throw new Error(
      `${missing.map((m) => `${m}.json`).join(', ')} missing in ${data} – run \`strassen-trainer data\` first`,
    )
  // `out` is deleted, so it must be an earlier build (or nothing), never the town folder itself
  if (existsSync(out) && readdirSync(out).length && !existsSync(join(out, 'index.html')))
    throw new Error(`${out} exists and isn't an earlier build – pick another --out`)
  if (resolve(out) === resolve(data, '..') || existsSync(join(out, 'region.json')))
    throw new Error(`refusing to replace ${out}: it holds the town's own files`)

  const files: [string, string][] = [
    ['config.json', JSON.stringify(publicConfig(region))],
    ...DATA_FILES.map((name): [string, string] => [
      `${name}.json`,
      JSON.stringify(JSON.parse(readFileSync(join(data, `${name}.json`), 'utf8'))),
    ]),
  ]
  const hash = createHash('sha256')
  for (const [name, json] of files) hash.update(`${name}\n${json}\n`)
  const dir = `data/${hash.digest('hex').slice(0, 10)}`

  rmSync(out, { recursive: true, force: true })
  cpSync(app, out, { recursive: true })
  mkdirSync(join(out, dir), { recursive: true })
  for (const [name, json] of files) writeFileSync(join(out, dir, name), json)
  writeFileSync(join(out, 'index.html'), fillPage(readFileSync(join(app, 'index.html'), 'utf8'), region, `./${dir}/`))
  writeFileSync(join(out, 'manifest.webmanifest'), manifest(region))
  return dir
}
