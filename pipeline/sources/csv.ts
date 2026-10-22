import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

/**
 * Streams the rows of a `;`-separated CSV file (quoted fields allowed, no line breaks inside
 * them) as objects keyed by the header. `keep` sees the raw line first, a cheap pre-filter that
 * spares parsing the other 99 % of a nationwide file.
 */
export async function* readCsv(path: string, keep: (line: string) => boolean): AsyncGenerator<Record<string, string>> {
  let header: string[] | undefined
  for await (const line of createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })) {
    if (!header) header = splitLine(line.replace(/^﻿/, ''))
    else if (keep(line)) {
      const cells = splitLine(line)
      yield Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']))
    }
  }
}

export function splitLine(line: string): string[] {
  const cells: string[] = []
  let [cell, quoted] = ['', false]
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') cell += line[++i]
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ';') {
      cells.push(cell)
      cell = ''
    } else cell += ch
  }
  cells.push(cell)
  return cells
}
