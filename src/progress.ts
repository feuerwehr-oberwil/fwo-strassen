import { useCallback, useEffect, useState } from 'react'

// Leitner-style spaced repetition. Every question has a key (e.g. "find:<id>") and a card.
// A right answer moves the card up one box (longer wait), a wrong one back to box 0.
// `at` = when it was last answered; used to merge progress from the backup.
export type Card = { box: number; due: number; at?: number }
export type Cards = Record<string, Card>

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
/** Wait before a card in box i is asked again. */
export const INTERVALS = [MINUTE, 10 * MINUTE, DAY, 3 * DAY, 7 * DAY, 21 * DAY] as const
/** From this box on a card counts as «sicher». */
export const LEARNED_BOX = 3
/** A street you get right the very first time is known already: skip the 10-minute repeat. */
const KNOWN_BOX = 2

export function review(card: Card | undefined, correct: boolean, now: number): Card {
  const box = !correct ? 0 : card ? Math.min(card.box + 1, INTERVALS.length - 1) : KNOWN_BOX
  return { box, due: now + INTERVALS[box]!, at: now }
}

/** Per key, keeps whichever card was answered last. */
export function mergeCards(a: Cards, b: Cards): Cards {
  const out = { ...a }
  for (const [k, card] of Object.entries(b)) {
    const mine = out[k]
    if (!mine || (card.at ?? 0) > (mine.at ?? 0)) out[k] = card
  }
  return out
}

/** How many of `keys` are new, being learned, or solid (answered right 3× in a row). */
export function progressCounts(keys: string[], cards: Cards) {
  let learning = 0
  let solid = 0
  for (const k of keys) {
    const c = cards[k]
    if (!c) continue
    if (c.box >= LEARNED_BOX) solid++
    else learning++
  }
  return { solid, learning, fresh: keys.length - solid - learning }
}

/** useState that survives reloads, stored as JSON under `key` in localStorage. */
export function useStoredState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return JSON.parse(raw) as T
    } catch {
      // corrupt or blocked storage: start fresh
    }
    return initial instanceof Function ? initial() : initial
  })
  useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value])
  return [value, setValue] as const
}

const dayOf = (now: number) => new Date(now).toLocaleDateString('sv') // YYYY-MM-DD, local time

/** Progress for this device. `today` = answers given today; `merge` folds in backed-up cards. */
export function useProgress() {
  const [state, setState] = useStoredState('fwo-strassen:v1', { cards: {} as Cards, day: '', today: 0 })
  const [openedOn] = useState(() => dayOf(Date.now()))

  const record = useCallback(
    (key: string, correct: boolean) => {
      const now = Date.now()
      setState((s) => {
        const day = dayOf(now)
        return {
          cards: { ...s.cards, [key]: review(s.cards[key], correct, now) },
          day,
          today: (s.day === day ? s.today : 0) + 1,
        }
      })
    },
    [setState],
  )
  const merge = useCallback(
    (cards: Cards) => setState((s) => ({ ...s, cards: mergeCards(s.cards, cards) })),
    [setState],
  )

  const today = state.day === openedOn ? state.today : 0
  return { cards: state.cards, today, record, merge }
}

export type Progress = ReturnType<typeof useProgress>
