import type { Line, Polygon, XY } from './geometry.ts'

/**
 * What a data source (swisstopo now, OpenStreetMap next) hands the generic town builder: raw
 * streets, named areas and addresses for one town, all in the source's metric CRS.
 */
export type SourceData = {
  /** Attribution shown in the app, e.g. «© swisstopo – …». */
  attribution: string
  /** proj4 definition of the metric CRS all coordinates are in (e.g. LV95). */
  crs: string
  /** Named streets in a stable order (ties in cross-street order fall back to it). */
  streets: { id: string; name: string; lines: Line[] }[]
  /** Named areas without a street line (Flurnamen), drawn as polygons. */
  areas: { id: string; name: string; polygons: Polygon[] }[]
  /** Building addresses; `number` is the label as written, e.g. "12a". */
  addresses: { streetId: string; number: string; at: XY }[]
  /** The station's address point. */
  station: XY
}
