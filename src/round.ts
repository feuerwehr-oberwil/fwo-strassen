import type { Cards } from './progress'
import { neighbours, type Item } from './town'

// A round is 10 questions picked by spaced repetition, then a summary.
// Question keys: "find:<id>" / "name:<id>" for streets and named areas,
// "nr:<id>:<section>" for house-number sections (shared by both modes).

export type Mode = 'find' | 'name'

export type Question =
  | { kind: 'find'; key: string; item: Item }
  | { kind: 'name'; key: string; item: Item; options: Item[] }
  | { kind: 'section'; key: string; item: Item; section: number }

export const ROUND_SIZE = 10
/** Caps so a round with house numbers still is mostly about streets. */
const MAX_SECTIONS = 4
const MAX_SECTIONS_PER_STREET = 2

/**
 * All question keys for a mode, in learning order: each item (long streets first),
 * followed by its house-number sections when `withNumbers` is on.
 */
export function roundKeys(mode: Mode, items: Item[], withNumbers: boolean): string[] {
  return items.flatMap((i) => [`${mode}:${i.id}`, ...(withNumbers ? i.sections.map((_, s) => `nr:${i.id}:${s}`) : [])])
}

/**
 * Picks the keys for one round: overdue cards first (lowest box, most overdue), then new
 * keys in learning order, then the cards due soonest. Section questions are capped per
 * round and per street; the caps are dropped only if the round can't be filled otherwise.
 */
export function pickRound(keys: string[], cards: Cards, now: number, size = ROUND_SIZE): string[] {
  const seen = keys.filter((k) => cards[k])
  const due = seen
    .filter((k) => cards[k]!.due <= now)
    .toSorted((a, b) => cards[a]!.box - cards[b]!.box || cards[a]!.due - cards[b]!.due)
  const fresh = keys.filter((k) => !cards[k])
  const later = seen.filter((k) => cards[k]!.due > now).toSorted((a, b) => cards[a]!.due - cards[b]!.due)
  const candidates = [...due, ...fresh, ...later]

  const picked: string[] = []
  const perStreet = new Map<string, number>()
  let sections = 0
  for (const k of candidates) {
    if (picked.length === size) break
    if (k.startsWith('nr:')) {
      const street = k.split(':')[1]!
      const n = perStreet.get(street) ?? 0
      if (sections >= MAX_SECTIONS || n >= MAX_SECTIONS_PER_STREET) continue
      perStreet.set(street, n + 1)
      sections++
    }
    picked.push(k)
  }
  for (const k of candidates) {
    if (picked.length === size) break
    if (!picked.includes(k)) picked.push(k)
  }
  return picked
}

/**
 * Flips house numbers on or off for the still-open questions of a running round, so the
 * switch only swaps a few questions instead of reshuffling everything.
 * On: up to the section cap, street questions are replaced by section questions; the first
 * open question (the one on screen) stays. Off: every open section question becomes a street
 * question. `pool` holds the keys for the new setting, `used` all keys already in the round.
 */
export function toggleSections(
  open: string[],
  used: Set<string>,
  pool: string[],
  withNumbers: boolean,
  cards: Cards,
  now: number,
): string[] {
  const isSection = (k: string) => k.startsWith('nr:')
  const fresh = (match: (k: string) => boolean, n: number) =>
    pickRound(
      pool.filter((k) => match(k) && !used.has(k)),
      cards,
      now,
      n,
    )
  if (!withNumbers) {
    const streets = fresh((k) => !isSection(k), open.filter(isSection).length)
    return open.map((k) => (isSection(k) ? (streets.shift() ?? k) : k))
  }
  const slots = open.flatMap((k, i) => (i > 0 && !isSection(k) ? [i] : []))
  const wanted = Math.min(MAX_SECTIONS, Math.round(open.length * 0.4)) - open.filter(isSection).length
  const sections = fresh(isSection, Math.max(0, wanted))
  // spread the new section questions evenly over the open street questions
  const step = slots.length / (sections.length || 1)
  const out = [...open]
  sections.forEach((k, j) => (out[slots[Math.floor(j * step)]!] = k))
  return out
}

/** Turns a key into a question; "name" questions get three nearby items as wrong answers. */
export function makeQuestion(key: string, items: Item[]): Question {
  const [kind, id, section] = key.split(':')
  const item = items.find((i) => i.id === id)!
  if (kind === 'nr') return { kind: 'section', key, item, section: Number(section) }
  if (kind === 'name') return { kind: 'name', key, item, options: shuffle([item, ...neighbours(item, items, 3)]) }
  return { kind: 'find', key, item }
}

export function isCorrect(q: Question, pick: string | number): boolean {
  return q.kind === 'section' ? pick === q.section : pick === q.item.id
}

export function shuffle<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}
