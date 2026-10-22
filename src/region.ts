import type { LngLat } from './town'

/**
 * Shape of region.json at the repo root: the one file someone edits to set the trainer up for their
 * town. Read by the app (brand, language), vite.config.ts (title, manifest) and the data pipeline.
 */
export type Region = {
  /** Town name as shown in the app title, e.g. «Strassen-Trainer Oberwil». */
  name: string
  /** Organisation shown above the title. */
  brand: string
  language: 'de' | 'fr' | 'en'
  /** Where streets and addresses come from. swisstopo: Swiss municipality by BFS number. */
  source: { type: 'swisstopo'; bfs: number }
  /** Address of the station: the only marker on the map and the start of every route. */
  station: { street: string; number: string }
  /** Local knowledge OpenStreetMap lacks, applied to the truck routes. */
  fixes: {
    /** Closures missing in OSM; the nearest road node is closed. */
    barriers: { at: LngLat; note?: string }[]
    /** Residential streets driven as access roads anyway (timed like a tertiary road). */
    accessRoads: string[]
  }
}
