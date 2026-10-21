import type { Cards } from './progress'
import { neighbours, type Item } from './town'

// A round is 10 questions picked by spaced repetition, then a summary. Streets that are new to
// the user are first introduced (a few at a time, shown with their names) and then asked.
// Question keys: "find:<id>" / "name:<id>" for streets and named areas,
// "nr:<id>:<section>" for house-number sections (shared by both modes), "intro:<id>,<id>,…" for intros.

export type Mode = 'find' | 'name'

/** One new street on an intro screen; `withSections` when the round also asks its house numbers. */
export type IntroItem = { item: Item; withSections: boolean }

export type Question =
  | { kind: 'intro'; key: string; items: IntroItem[] }
  | { kind: 'find'; key: string; item: Item }
  | { kind: 'name'; key: string; item: Item; options: Item[] }
  | { kind: 'section'; key: string; item: Item; section: number }

export const ROUND_SIZE = 10
/** Caps so a round with house numbers still is mostly about streets. */
const MAX_SECTIONS = 4
const MAX_SECTIONS_PER_STREET = 2
/** New streets are introduced in batches of at most this many. */
export const INTRO_BATCH = 4

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

const streetOf = (key: string) => key.split(':')[1]!

/**
 * Orders a round's picked keys into steps. With `introduce`, the streets that are new to the user
 * (any of their keys without a card) are introduced in batches of INTRO_BATCH; each batch's intro
 * step comes right before its questions, mixed with an even share of the repeat questions.
 */
export function planRound(picks: string[], cards: Cards, introduce: boolean): string[] {
  const fresh = introduce ? [...new Set(picks.filter((k) => !cards[k]).map(streetOf))] : []
  if (fresh.length === 0) return shuffle(picks)
  const batches = Array.from({ length: Math.ceil(fresh.length / INTRO_BATCH) }, (_, i) =>
    fresh.slice(i * INTRO_BATCH, (i + 1) * INTRO_BATCH),
  )
  const repeats = shuffle(picks.filter((k) => !fresh.includes(streetOf(k))))
  return batches.flatMap((ids, i) => {
    const share = repeats.splice(0, Math.ceil(repeats.length / (batches.length - i)))
    return [`intro:${ids.join(',')}`, ...shuffle([...picks.filter((k) => ids.includes(streetOf(k))), ...share])]
  })
}

/**
 * Turns a key into a question; "name" questions get three nearby items as wrong answers.
 * Intros come without sections; useRound switches them on for streets whose numbers are asked.
 */
export function makeQuestion(key: string, items: Item[]): Question {
  const [kind, id, section] = key.split(':')
  const byId = (id: string) => items.find((i) => i.id === id)!
  if (kind === 'intro')
    return { kind: 'intro', key, items: id!.split(',').map((i) => ({ item: byId(i), withSections: false })) }
  const item = byId(id!)
  if (kind === 'nr') return { kind: 'section', key, item, section: Number(section) }
  if (kind === 'name') return { kind: 'name', key, item, options: shuffle([item, ...neighbours(item, items, 3)]) }
  return { kind: 'find', key, item }
}

export function isCorrect(q: Exclude<Question, { kind: 'intro' }>, pick: string | number): boolean {
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
