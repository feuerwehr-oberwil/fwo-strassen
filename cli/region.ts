import { readFileSync } from 'node:fs'
import { type } from 'arktype'
import { Region } from '../src/region.ts'

/** Reads a region.json; throws a readable error when it is missing or doesn't match the schema. */
export function readRegion(file: string): Region {
  let json: unknown
  try {
    json = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`can't read ${file}: ${error instanceof Error ? error.message : error}`)
  }
  const region = Region(json)
  if (region instanceof type.errors) throw new Error(`${file} is invalid:\n${region.summary}`)
  return region
}
