import { readFileSync } from 'node:fs'
import { sectionKey, sectionLabel, type Item, type Town } from '../src/town.ts'

// What a data refresh changes for learners, as Markdown for the refresh PR
// (.github/workflows/data-refresh.yml): `node pipeline/townDiff.ts <old town.json> <new town.json>`.
// Progress is keyed on item ids and on house-number ranges (src/round.ts), so a removed street or a
// moved range boundary silently drops those cards; this lists them before anyone merges.

/** Changes between two town.json files, grouped by what they do to existing cards. */
export function townDiff(before: Town, after: Town) {
  const old = new Map(before.items.map((i) => [i.id, i]))
  const now = new Map(after.items.map((i) => [i.id, i]))
  const ranges = (i: Item) => new Map(i.sections.map((s) => [sectionKey(s), sectionLabel(s)]))
  const kept = [...now.values()].flatMap((i) => {
    const was = old.get(i.id)
    return was ? [{ was, is: i }] : []
  })
  return {
    removed: before.items.filter((i) => !now.has(i.id)).map((i) => i.name),
    added: after.items.filter((i) => !old.has(i.id)).map((i) => i.name),
    renamed: kept.filter(({ was, is }) => was.name !== is.name).map(({ was, is }) => `${was.name} → ${is.name}`),
    ranges: kept.flatMap(({ was, is }) => {
      const [a, b] = [ranges(was), ranges(is)]
      const gone = [...a].filter(([k]) => !b.has(k)).map(([, label]) => label)
      const fresh = [...b].filter(([k]) => !a.has(k)).map(([, label]) => label)
      return gone.length || fresh.length ? [{ name: is.name, gone, fresh }] : []
    }),
    ends: kept.flatMap(({ was, is }) => {
      const label = (e: Item['ends']) => (e ? `Nr. ${e.from}–${e.to}` : 'keine')
      return label(was.ends) === label(is.ends) ? [] : [`${is.name}: ${label(was.ends)} → ${label(is.ends)}`]
    }),
  }
}

/** The diff as a Markdown section; empty lists are left out. */
export function townDiffMarkdown(before: Town, after: Town): string {
  const d = townDiff(before, after)
  const list = (title: string, lines: string[]) =>
    lines.length ? [`**${title}** (${lines.length})`, ...lines.map((l) => `- ${l}`), ''] : []
  const out = [
    ...list('Removed streets/areas – their cards are dropped', d.removed),
    ...list(
      'Changed house-number ranges – cards on a removed range are dropped',
      d.ranges.map((r) => `${r.name}: ${[...r.gone.map((g) => `−${g}`), ...r.fresh.map((f) => `+${f}`)].join(', ')}`),
    ),
    ...list('Changed numbering ends («Wo ist Nr. 1?»)', d.ends),
    ...list('Renamed (cards kept)', d.renamed),
    ...list('New streets/areas', d.added),
  ]
  return out.length ? out.join('\n') : 'No street, range or numbering changes – progress is unaffected.\n'
}

if (process.argv[1] === import.meta.filename) {
  const [before, after] = process.argv.slice(2).map((f): Town => JSON.parse(readFileSync(f, 'utf8')))
  if (!before || !after) throw new Error('usage: node pipeline/townDiff.ts <old town.json> <new town.json>')
  process.stdout.write(townDiffMarkdown(before, after))
}
