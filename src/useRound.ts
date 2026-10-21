import { useMemo, useState } from 'react'
import { useStoredState, type Progress } from './progress'
import {
  isCorrect,
  makeQuestion,
  pickRound,
  planRound,
  roundKeys,
  toggleSections,
  type Mode,
  type Question,
} from './round'
import { byImportance, type Town } from './town'

/** `intro`: show new streets before asking them. */
export type Settings = { mode: Mode; withNumbers: boolean; intro: boolean }
const DEFAULTS: Settings = { mode: 'find', withNumbers: false, intro: true }
/** An answer: the tapped item id, or the section index for house-number questions. */
export type Pick = string | number

/**
 * Steps of a round (intros and questions). `results` has one entry per finished step: right/wrong
 * for questions, null for intros. `selection` is a tap on the map that still needs «Prüfen».
 */
type Round = {
  id: number
  questions: Question[]
  index: number
  results: (boolean | null)[]
  selection: Pick | null
  pick: Pick | null
}

/**
 * The current round and the quiz settings. Changing the mode starts a new round; the
 * house-number switch only swaps open questions. `question` is undefined once the round is done.
 */
export function useRound(town: Town, progress: Progress) {
  const items = useMemo(() => byImportance(town.items), [town])
  const [stored, setSettings] = useStoredState<Partial<Settings>>('fwo-strassen:settings', DEFAULTS)
  const settings: Settings = { ...DEFAULTS, ...stored }
  const keys = useMemo(
    () => roundKeys(settings.mode, items, settings.withNumbers),
    [items, settings.mode, settings.withNumbers],
  )

  const toQuestions = (steps: string[]): Question[] =>
    steps.map((k) => {
      const q = makeQuestion(k, items)
      // an intro shows the street's sections when the round also asks for them
      return q.kind === 'intro' ? { ...q, withSections: steps.some((s) => s.startsWith(`nr:${q.item.id}:`)) } : q
    })
  const newRound = (s: Settings, id: number): Round => {
    const picks = pickRound(roundKeys(s.mode, items, s.withNumbers), progress.cards, Date.now())
    const steps = planRound(picks, progress.cards, s.intro)
    return { id, questions: toQuestions(steps), index: 0, results: [], selection: null, pick: null }
  }
  const [round, setRound] = useState(() => newRound(settings, 0))
  const question = round.questions[round.index]
  const answered = round.pick !== null || question?.kind === 'intro'

  const answer = (pick: Pick) => {
    if (!question || question.kind === 'intro' || round.pick !== null) return
    const correct = isCorrect(question, pick)
    progress.record(question.key, correct)
    setRound({ ...round, pick, selection: null, results: [...round.results, correct] })
  }

  return {
    items,
    keys,
    settings,
    round,
    question,
    /** True once the current step may be left with «Weiter». */
    answered,
    configure(patch: Partial<Settings>) {
      const s = { ...settings, ...patch }
      setSettings(s)
      if (s.mode !== settings.mode) return setRound(newRound(s, round.id + 1))
      if (s.withNumbers === settings.withNumbers) return // intro switch: applies from the next round
      // house numbers flipped: keep finished steps and the one on screen, swap the rest
      const firstOpen = round.pick === null ? round.index : round.index + 1
      const open = round.questions.slice(firstOpen).map((q) => q.key)
      const used = new Set(round.questions.map((q) => q.key))
      const pool = roundKeys(s.mode, items, s.withNumbers)
      const swapped = toggleSections(open, used, pool, s.withNumbers, progress.cards, Date.now())
      const kept = new Map(round.questions.map((q) => [q.key, q]))
      setRound({
        ...round,
        questions: [
          ...round.questions.slice(0, firstOpen),
          ...swapped.map((k) => kept.get(k) ?? makeQuestion(k, items)),
        ],
      })
    },
    restart() {
      setRound(newRound(settings, round.id + 1))
    },
    /** A tap on the map: only marks the answer, «Prüfen» confirms it. */
    select(pick: Pick) {
      if (question && question.kind !== 'intro' && round.pick === null) setRound({ ...round, selection: pick })
    },
    confirm() {
      if (round.selection !== null) answer(round.selection)
    },
    answer,
    /** «Kenne ich schon» on an intro: ask this street right now instead of showing it. */
    skipIntro() {
      if (question?.kind !== 'intro') return
      const later = round.questions.findIndex((q, i) => i > round.index && q.item.id === question.item.id)
      const rest = round.questions.filter((_, i) => i !== round.index && i !== later)
      const asked = later >= 0 ? [round.questions[later]!] : []
      rest.splice(round.index, 0, ...asked)
      setRound({ ...round, questions: rest })
    },
    next() {
      if (!answered) return
      // questions already logged their result in answer(); an intro logs null
      const results = question?.kind === 'intro' ? [...round.results, null] : round.results
      setRound({ ...round, index: round.index + 1, pick: null, selection: null, results })
    },
  }
}

export type RoundApi = ReturnType<typeof useRound>
