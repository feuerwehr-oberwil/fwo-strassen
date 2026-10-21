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

export const learnedCount = (keys: string[], cards: Cards) =>
  keys.filter((k) => (cards[k]?.box ?? 0) >= LEARNED_BOX).length

/** useState that survives reloads, stored as JSON under `key` in localStorage. */
export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return JSON.parse(raw) as T
    } catch {
      // corrupt or blocked storage: start fresh
    }
    return initial
  })
  useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value])
  return [value, setValue] as const
}

const dayOf = (now: number) => new Date(now).toLocaleDateString('sv') // YYYY-MM-DD, local time

/** Progress for this device. `today` = answers given today. */
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

  const today = state.day === openedOn ? state.today : 0
  return { cards: state.cards, today, record }
}

export type Progress = ReturnType<typeof useProgress>
