import type { StyleSpecification } from 'maplibre-gl'
import type { PublicConfig } from './region'
import type { Routes, Town } from './town'

/** Everything the app needs about its town, loaded once at startup. */
export type TownData = { config: PublicConfig; town: Town; routes: Routes; basemap: StyleSpecification }

/**
 * Loads the town from the data directory named in index.html's <meta name="strassen-data">.
 * `strassen-trainer build` writes the data to data/<content hash>/ and puts that path into
 * index.html, so a page always loads the data it was built with: hosts like GitHub Pages cache
 * loose files for ~10 minutes, and a stale index.html then still pairs its own (hashed) JS with its
 * own data instead of mixing deploys. The dev server serves ./data/ (vite.config.ts).
 */
export async function loadTownData(): Promise<TownData> {
  const dir = document.querySelector<HTMLMetaElement>('meta[name="strassen-data"]')?.content ?? './data/'
  const get = async <T>(name: string): Promise<T> => {
    const res = await fetch(`${dir}${name}.json`)
    if (!res.ok) throw new Error(`${dir}${name}.json: HTTP ${res.status}`)
    return res.json()
  }
  const [config, town, routes, basemap] = await Promise.all([
    get<PublicConfig>('config'),
    get<Town>('town'),
    get<Routes>('routes'),
    get<StyleSpecification>('basemap'),
  ])
  return { config, town, routes, basemap }
}
