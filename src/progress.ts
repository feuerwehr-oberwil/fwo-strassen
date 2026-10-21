import { useCallback, useEffect, useState } from 'react'

// Leitner-style spaced repetition. Every question has a key (e.g. "find:<id>") and a card.
// A right answer moves the card up one box (longer wait), a wrong one back to box 0.
export type Card = { box: number; due: number }
export type Cards = Record<string, Card>

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
/** Wait before a card in box i is asked again. */
export const INTERVALS = [MINUTE, 10 * MINUTE, DAY, 3 * DAY, 7 * DAY, 21 * DAY] as const
/** From this box on a card counts as learned. */
export const LEARNED_BOX = 3

export function review(card: Card | undefined, correct: boolean, now: number): Card {
  const box = correct ? Math.min((card?.box ?? 0) + 1, INTERVALS.length - 1) : 0
  return { box, due: now + INTERVALS[box]! }
}

/**
 * Next key to ask: the most overdue card first, then a new key (in the given order),
 * then the card that is due soonest. Never repeats `last` if anything else is left.
 */
export function pickNext(keys: string[], cards: Cards, now: number, last?: string): string | undefined {
  const pool = keys.length > 1 ? keys.filter((k) => k !== last) : keys
  const seen = pool.filter((k) => cards[k])
  const due = seen.filter((k) => cards[k]!.due <= now)
  if (due.length) return due.toSorted((a, b) => cards[a]!.box - cards[b]!.box || cards[a]!.due - cards[b]!.due)[0]
  const fresh = pool.find((k) => !cards[k])
  if (fresh) return fresh
  return seen.toSorted((a, b) => cards[a]!.due - cards[b]!.due)[0]
}

export const learnedCount = (keys: string[], cards: Cards) =>
  keys.filter((k) => (cards[k]?.box ?? 0) >= LEARNED_BOX).length

type Stored = { cards: Cards; day: string; today: number }
const STORAGE_KEY = 'fwo-strassen:v1'
const dayOf = (now: number) => new Date(now).toLocaleDateString('sv') // YYYY-MM-DD, local time

function load(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Stored
  } catch {
    // corrupt or blocked storage: start fresh
  }
  return { cards: {}, day: dayOf(Date.now()), today: 0 }
}

/** Progress for this device, persisted in localStorage. `today` = answers given today. */
export function useProgress() {
  const [state, setState] = useState(load)
  const [openedOn] = useState(() => dayOf(Date.now()))
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), [state])

  const record = useCallback((key: string, correct: boolean) => {
    const now = Date.now()
    setState((s) => {
      const day = dayOf(now)
      return {
        cards: { ...s.cards, [key]: review(s.cards[key], correct, now) },
        day,
        today: (s.day === day ? s.today : 0) + 1,
      }
    })
  }, [])

  const today = state.day === openedOn ? state.today : 0
  return { cards: state.cards, today, record }
}
