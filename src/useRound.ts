import { useEffect, useMemo, useState } from 'react'
import region from '../region.json'
import { useStoredState, type Progress } from './progress'
import { isCorrect, makeQuestion, pickRound, planRound, roundKeys, shuffle, type Mode, type Question } from './round'
import { byImportance, type Town } from './town'

/** `intro`: show new streets before asking them. */
export type Settings = { mode: Mode; withNumbers: boolean; intro: boolean }
const DEFAULTS: Settings = { mode: 'find', withNumbers: false, intro: true }
/** An answer: the tapped item id, or the section index for house-number questions. */
export type Pick = string | number
/** A right answer moves on by itself after this long. */
export const AUTO_NEXT_MS = 2000

/**
 * Steps of a round (intros and questions). `results` has one entry per finished step: right/wrong
 * for questions, null for intros. `selection` is a tap on the map that still needs «Prüfen».
 * `practice` = a round of the previous round's misses.
 */
export type Round = {
  id: number
  questions: Question[]
  index: number
  results: (boolean | null)[]
  selection: Pick | null
  pick: Pick | null
  practice: boolean
}

/**
 * The quiz settings and the running round. There is no round on the start screen (`round` null);
 * once all steps are answered `question` is undefined and the summary shows.
 */
export function useRound(town: Town, progress: Progress) {
  const items = useMemo(() => byImportance(town.items, region.language), [town])
  const [stored, setSettings] = useStoredState<Partial<Settings>>('fwo-strassen:settings', DEFAULTS)
  const settings: Settings = { ...DEFAULTS, ...stored }
  const keys = useMemo(
    () => roundKeys(settings.mode, items, settings.withNumbers),
    [items, settings.mode, settings.withNumbers],
  )
  const [round, setRound] = useState<Round | null>(null)
  const question = round?.questions[round.index]
  const answered = round?.pick != null || question?.kind === 'intro'

  const toQuestions = (steps: string[]): Question[] =>
    steps.map((k) => {
      const q = makeQuestion(k, items)
      // an intro shows a street's house numbers when the round also asks for them
      if (q.kind !== 'intro') return q
      const asked = (id: string) => steps.some((s) => s.startsWith(`nr:${id}:`) || s === `start:${id}`)
      return { ...q, items: q.items.map((i) => ({ ...i, withNumbers: asked(i.item.id) })) }
    })
  const begin = (steps: string[], practice: boolean) =>
    setRound((r) => ({
      id: (r?.id ?? 0) + 1,
      questions: toQuestions(steps),
      index: 0,
      results: [],
      selection: null,
      pick: null,
      practice,
    }))
  const next = () =>
    setRound((r) => {
      const q = r?.questions[r.index]
      if (!r || (r.pick === null && q?.kind !== 'intro')) return r
      // questions already logged their result in answer(); an intro logs null
      const results = q?.kind === 'intro' ? [...r.results, null] : r.results
      return { ...r, index: r.index + 1, pick: null, selection: null, results }
    })

  // a right answer moves on by itself
  const rightAnswer = round?.pick != null && round.results.at(-1) === true
  useEffect(() => {
    if (!rightAnswer) return
    const timer = setTimeout(next, AUTO_NEXT_MS)
    return () => clearTimeout(timer)
    // next only uses functional updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightAnswer, round?.id, round?.index])

  const answer = (pick: Pick) => {
    if (!round || !question || question.kind === 'intro' || round.pick !== null) return
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
    /** Settings only change on the start screen, so they apply to the next round. */
    configure(patch: Partial<Settings>) {
      setSettings({ ...settings, ...patch })
    },
    start() {
      const picks = pickRound(keys, progress.cards, Date.now())
      begin(planRound(picks, progress.cards, settings.intro), false)
    },
    /** A round of just the questions the finished round got wrong. */
    practiceMisses() {
      if (!round) return
      begin(shuffle(round.questions.filter((_, i) => round.results[i] === false).map((q) => q.key)), true)
    },
    /** Back to the start screen. Answers are already saved. */
    quit() {
      setRound(null)
    },
    /** A tap on the map: only marks the answer, «Prüfen» confirms it. */
    select(pick: Pick) {
      if (round && question && question.kind !== 'intro' && round.pick === null) setRound({ ...round, selection: pick })
    },
    confirm() {
      if (round?.selection != null) answer(round.selection)
    },
    answer,
    next,
  }
}

export type RoundApi = ReturnType<typeof useRound>
