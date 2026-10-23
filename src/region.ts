import { type } from 'arktype'

/**
 * Shape of region.json: the one file someone edits to set the trainer up for their town (written
 * by `strassen-trainer init`). The CLI validates it with this schema, runs the data pipeline on it
 * and writes the page title, manifest and config.json from it. The app imports only types from
 * here, so arktype isn't bundled.
 */
export const Region = type({
  /** Town name as shown in the app title, e.g. «Strassen-Trainer Oberwil». */
  name: 'string',
  /** Organisation shown above the title. */
  brand: 'string',
  language: "'de' | 'fr' | 'en'",
  /** Where streets and addresses come from. swisstopo: Swiss municipality by BFS number. */
  source: { type: "'swisstopo'", bfs: 'number.integer' },
  /** Address of the station: the only marker on the map and the start of every route. */
  station: { street: 'string', number: 'string' },
  /**
   * Hauptachsen by street name: long streets get their house-number sections cut where these meet
   * them (e.g. Hohestrasse at Allschwilerstrasse). Without any, sections split by address count.
   */
  axes: type('string[]').default(() => []),
  /** Local knowledge OpenStreetMap lacks, applied to the truck routes. */
  fixes: {
    /** Closures missing in OSM ([lng, lat]); the nearest road node is closed. */
    barriers: type({ at: ['number', 'number'], 'note?': 'string' }).array(),
    /** Residential streets driven as access roads anyway (timed like a tertiary road). */
    accessRoads: 'string[]',
  },
})
export type Region = typeof Region.infer

/**
 * What the app gets from region.json at runtime (config.json, written by `strassen-trainer build`).
 * `axes`: the Hauptachsen, labelled on the map as the fixed points of reference.
 */
export type PublicConfig = Pick<Region, 'name' | 'brand' | 'language' | 'axes'>
export const publicConfig = ({ name, brand, language, axes }: Region): PublicConfig => ({ name, brand, language, axes })
