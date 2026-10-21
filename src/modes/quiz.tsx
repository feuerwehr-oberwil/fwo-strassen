import { useMemo, useState } from 'react'
import { learnedCount, pickNext } from '../progress'
import { byImportance, neighbours, streetsBBox, union, type BBox, type Item, type Town } from '../town'
import type { Tone } from '../palette'
import { Button, Card, ProgressRow, type ModeView, type Progress } from '../ui'

/** "find": name given, tap it on the map. "name": item highlighted, pick its name. */
export type QuizKind = 'find' | 'name'

type Question = { key: string; target: Item; options: Item[] }

/** Mode A: one question at a time over all streets and named areas, spaced repetition. */
export function useQuiz(kind: QuizKind, town: Town, progress: Progress): ModeView {
  const items = useMemo(() => byImportance(town.items), [town])
  const keys = useMemo(() => items.map((i) => `${kind}:${i.id}`), [items, kind])
  const overview = useMemo(() => streetsBBox(town.items), [town])
  const byKey = useMemo(() => new Map(items.map((i) => [`${kind}:${i.id}`, i])), [items, kind])

  const ask = (last?: string): Question => {
    const key = pickNext(keys, progress.cards, Date.now(), last) ?? keys[0]!
    const target = byKey.get(key)!
    const options = shuffle([target, ...neighbours(target, items, 3)])
    return { key, target, options }
  }
  const [question, setQuestion] = useState(ask)
  const [picked, setPicked] = useState<Item | null>(null)
  const { target } = question
  const correct = picked?.id === target.id

  const answer = (id: string) => {
    if (picked) return
    const item = items.find((i) => i.id === id)
    if (!item) return
    setPicked(item)
    progress.record(question.key, item.id === target.id)
  }
  const next = () => {
    setPicked(null)
    setQuestion(ask(question.key))
  }

  const highlights = useMemo(() => {
    const hl: { id: string; tone: Tone }[] = []
    if (picked && !correct) hl.push({ id: picked.id, tone: 'bad' })
    if (picked) hl.push({ id: target.id, tone: 'ok' })
    else if (kind === 'name') hl.push({ id: target.id, tone: 'target' })
    return hl
  }, [picked, correct, target, kind])

  const fit: BBox = picked
    ? union(target.bbox, picked.bbox)
    : kind === 'find'
      ? overview
      : withMargin(target.bbox, 0.004)

  const noun = target.kind === 'area' ? 'das Gebiet' : 'die Strasse'
  const prompt = (
    <Card>
      {kind === 'find' ? (
        <>
          <div className="text-sm text-stone-500">Tippe auf {noun}</div>
          <div className="text-lg font-bold">{target.name}</div>
        </>
      ) : (
        <div className="text-lg font-bold">
          Wie heisst {target.kind === 'area' ? 'das orange Gebiet' : 'die orange Strasse'}?
        </div>
      )}
    </Card>
  )

  const feedback = picked && (
    <div className="text-base">
      {correct ? (
        <>
          ✓ <b>Richtig</b> – {target.name}
        </>
      ) : (
        <>
          ✗ Das war <b className="text-red-600">{picked.name}</b>.<br />
          <b className="text-green-700">{target.name}</b> ist grün.
          <div className="text-xs text-stone-500">Kommt bald nochmal.</div>
        </>
      )}
    </div>
  )

  const sheet = (
    <>
      <ProgressRow today={progress.today} learned={learnedCount(keys, progress.cards)} total={keys.length} />
      {kind === 'name' &&
        question.options.map((o) => (
          <Button
            key={o.id}
            onClick={() => answer(o.id)}
            tone={!picked ? 'plain' : o.id === target.id ? 'ok' : o.id === picked.id ? 'bad' : 'plain'}
          >
            {o.name}
          </Button>
        ))}
      {kind === 'find' &&
        (feedback || <div className="text-sm text-stone-500">Zoomen und verschieben mit zwei Fingern.</div>)}
      {picked && (
        <Button tone="primary" onClick={next}>
          <span className="block text-center">Weiter</span>
        </Button>
      )}
    </>
  )

  return { map: { highlights, fit, onPickItem: kind === 'find' ? answer : undefined }, prompt, sheet }
}

function withMargin([w, s, e, n]: BBox, deg: number): BBox {
  return [w - deg * 1.5, s - deg, e + deg * 1.5, n + deg]
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}
