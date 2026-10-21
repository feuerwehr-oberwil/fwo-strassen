import { useMemo, useState } from 'react'
import { useStoredState, type Progress } from './progress'
import { isCorrect, makeQuestion, pickRound, roundKeys, shuffle, type Mode, type Question } from './round'
import { byImportance, type Town } from './town'

export type Settings = { mode: Mode; withNumbers: boolean }
/** An answer: the tapped item id, or the section index for house-number questions. */
export type Pick = string | number

type Round = { id: number; questions: Question[]; index: number; results: boolean[]; pick: Pick | null }

/**
 * The current round of 10 questions and the quiz settings (mode, house numbers on/off).
 * Changing a setting starts a new round. `question` is undefined once the round is done.
 */
export function useRound(town: Town, progress: Progress) {
  const items = useMemo(() => byImportance(town.items), [town])
  const [settings, setSettings] = useStoredState<Settings>('fwo-strassen:settings', {
    mode: 'find',
    withNumbers: false,
  })
  const keys = useMemo(() => roundKeys(settings.mode, items, settings.withNumbers), [items, settings])

  const newRound = (s: Settings, id: number): Round => ({
    id,
    questions: shuffle(pickRound(roundKeys(s.mode, items, s.withNumbers), progress.cards, Date.now())).map((k) =>
      makeQuestion(k, items),
    ),
    index: 0,
    results: [],
    pick: null,
  })
  const [round, setRound] = useState(() => newRound(settings, 0))
  const question = round.questions[round.index]

  return {
    items,
    keys,
    settings,
    round,
    question,
    configure(patch: Partial<Settings>) {
      const s = { ...settings, ...patch }
      setSettings(s)
      setRound(newRound(s, round.id + 1))
    },
    restart() {
      setRound(newRound(settings, round.id + 1))
    },
    answer(pick: Pick) {
      if (!question || round.pick !== null) return
      const correct = isCorrect(question, pick)
      progress.record(question.key, correct)
      setRound({ ...round, pick, results: [...round.results, correct] })
    },
    next() {
      if (round.pick !== null) setRound({ ...round, index: round.index + 1, pick: null })
    },
  }
}

export type RoundApi = ReturnType<typeof useRound>
