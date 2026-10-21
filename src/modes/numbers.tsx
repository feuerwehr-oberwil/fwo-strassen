import { useMemo, useState } from 'react'
import { learnedCount, pickNext } from '../progress'
import { byImportance, sectionLabel, type Item, type Town } from '../town'
import { NEUTRAL, SECTION_COLORS, TONE_COLOR } from '../palette'
import type { Overlay } from '../TownMap'
import { Button, Card, ProgressRow, Segmented, type ModeView, type Progress } from '../ui'

const NO_HIGHLIGHTS: never[] = []

type Sub = 'learn' | 'quiz'
const SUBS = [
  { value: 'learn', label: 'Lernen' },
  { value: 'quiz', label: 'Abfragen' },
] as const

/**
 * Mode D: house-number sections of long streets.
 * "Lernen" shows one street in coloured sections, "Abfragen" asks for a section by its numbers.
 */
export function useNumbers(town: Town, progress: Progress): ModeView {
  const streets = useMemo(() => byImportance(town.items.filter((i) => i.sections.length)), [town])
  const alphabetical = useMemo(() => streets.toSorted((a, b) => a.name.localeCompare(b.name, 'de')), [streets])
  const keys = useMemo(() => streets.flatMap((s) => s.sections.map((_, i) => `nr:${s.id}:${i}`)), [streets])

  const [sub, setSub] = useState<Sub>('learn')
  const [learnId, setLearnId] = useState(streets[0]!.id)
  const ask = (last?: string) => pickNext(keys, progress.cards, Date.now(), last) ?? keys[0]!
  const [questionKey, setQuestionKey] = useState(() => ask())
  const [picked, setPicked] = useState<number | null>(null)

  const [, qId, qIndex] = questionKey.split(':')
  const quizStreet = streets.find((s) => s.id === qId)!
  const asked = Number(qIndex)
  const learnStreet = streets.find((s) => s.id === learnId)!
  const street = sub === 'learn' ? learnStreet : quizStreet

  const answer = (i: number) => {
    if (picked !== null) return
    setPicked(i)
    progress.record(questionKey, i === asked)
  }
  const next = () => {
    setPicked(null)
    setQuestionKey(ask(questionKey))
  }

  const overlays = useMemo<Overlay[]>(
    () =>
      street.sections.map((s, i) => {
        if (sub === 'learn') return { key: i, geometry: s.geometry, color: SECTION_COLORS[i]!, label: sectionLabel(s) }
        const color = picked === null ? NEUTRAL : i === asked ? TONE_COLOR.ok : i === picked ? TONE_COLOR.bad : NEUTRAL
        return { key: i, geometry: s.geometry, color, label: picked === null ? undefined : sectionLabel(s) }
      }),
    [street, sub, picked, asked],
  )

  const tabs = <Segmented options={SUBS} value={sub} onChange={setSub} />
  const prompt =
    sub === 'learn' ? (
      <Card>
        <div className="flex flex-col gap-2">
          {tabs}
          <select
            value={learnId}
            onChange={(e) => setLearnId(e.target.value)}
            className="rounded-lg bg-stone-100 px-2 py-2 text-lg font-bold"
          >
            {alphabetical.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </Card>
    ) : (
      <Card>
        <div className="flex flex-col gap-2">
          {tabs}
          <div>
            <div className="text-lg font-bold">
              {quizStreet.name} {sectionLabel(quizStreet.sections[asked]!)}
            </div>
            <div className="text-sm text-stone-500">Tippe den richtigen Abschnitt</div>
          </div>
        </div>
      </Card>
    )

  const sheet =
    sub === 'learn' ? (
      legend(learnStreet)
    ) : (
      <>
        <ProgressRow today={progress.today} learned={learnedCount(keys, progress.cards)} total={keys.length} />
        {picked === null ? (
          <div className="text-sm text-stone-500">
            {quizStreet.sections.length} Abschnitte – welcher hat diese Nummern?
          </div>
        ) : (
          <>
            <div className="text-base">
              {picked === asked ? (
                <>
                  ✓ <b>Richtig</b>
                </>
              ) : (
                <>
                  ✗ Das war Nr. <b className="text-red-600">{sectionLabel(quizStreet.sections[picked]!)}</b>. Der
                  richtige Abschnitt ist grün.
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setLearnId(quizStreet.id)
                  setSub('learn')
                }}
              >
                Strasse lernen
              </Button>
              <div className="flex-1 [&>button]:w-full">
                <Button tone="primary" onClick={next}>
                  <span className="block text-center">Weiter</span>
                </Button>
              </div>
            </div>
          </>
        )}
      </>
    )

  return {
    map: {
      highlights: NO_HIGHLIGHTS,
      overlays,
      fit: street.bbox,
      onPickOverlay: sub === 'quiz' ? answer : undefined,
    },
    prompt,
    sheet,
  }
}

/** Section list under the map in "Lernen". */
function legend(street: Item) {
  return (
    <ul className="flex max-h-[30dvh] flex-col gap-2 overflow-y-auto">
      {street.sections.map((s, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-1 size-3.5 shrink-0 rounded" style={{ background: SECTION_COLORS[i] }} />
          <div>
            <b>Nr. {sectionLabel(s)}</b>
            {s.crossStreets.length > 0 && (
              <div className="text-xs text-stone-500">Abzweigungen: {s.crossStreets.slice(0, 4).join(', ')}</div>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
