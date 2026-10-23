import { useEffect, useRef, type ReactNode } from 'react'
import { t } from './i18n'
import { TONE_COLOR, type Tone } from './palette'
import { distanceM, type Item } from './town'
import { Kbd } from './ui'

// Small pieces of the round screens (questionView.tsx).

/**
 * The answer inside the question card: what was asked (green line) and, if wrong, your tap
 * (dashed red). `gaveUp`: the question was passed, so there is no tap to show.
 */
export function Result({ target, wrong, gaveUp = false }: { target: Item; wrong: Item | undefined; gaveUp?: boolean }) {
  const verdict = wrong ? t.question.wrong(distanceM(target, wrong)) : gaveUp ? t.question.gaveUp : t.question.right
  return (
    <div className="flex flex-col gap-1">
      <Verdict right={!wrong && !gaveUp}>{verdict}</Verdict>
      <LineRow tone="ok" name={target.name} note={wrong && t.question.target} big />
      {wrong && <LineRow tone="bad" dashed name={wrong.name} note={t.question.yourTap} />}
    </div>
  )
}

/** The «Weiss nicht» pill under the question: a pass counts as wrong and shows the answer. */
export function GiveUp({ onClick, keyboard }: { onClick: () => void; keyboard: boolean }) {
  return (
    <button
      onClick={onClick}
      className="mx-auto block w-fit rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-stone-600 shadow-lg hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
    >
      {t.question.giveUp} {keyboard && <Kbd>0</Kbd>}
    </button>
  )
}

export function Verdict({ right, children }: { right: boolean; children: ReactNode }) {
  return (
    <div role="status" className={`text-sm font-bold ${right ? 'text-green-700' : 'text-red-700'}`}>
      {right ? '✓' : '✗'} {children}
    </div>
  )
}

/** Fills its button from left to right over `ms`, the time until the button presses itself. */
export function Countdown({ ms }: { ms: number }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 origin-left animate-fill bg-white/25"
      style={{ animationDuration: `${ms}ms` }}
    />
  )
}

/** A name with the line style it has on the map, so card and map read as one. */
function LineRow({
  tone,
  dashed,
  name,
  note,
  big,
}: {
  tone: Tone
  dashed?: boolean
  name: string
  note?: string
  big?: boolean
}) {
  const color = TONE_COLOR[tone]
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-1.5 w-5 shrink-0 rounded-full"
        style={{ background: dashed ? `repeating-linear-gradient(90deg, ${color} 0 5px, transparent 5px 8px)` : color }}
      />
      {/* the note flows after the name and wraps below it when a long name fills a small phone */}
      <span className="min-w-0">
        <span className={big ? 'text-2xl font-bold tracking-tight' : 'font-semibold text-stone-700'}>{name}</span>
        {note && <span className="ml-2 inline-block text-xs text-stone-500">{note}</span>}
      </span>
    </div>
  )
}

/**
 * Numbered rows matching the pins on the map; tapping one focuses it, tapping it again lets go. The
 * focused row scrolls into view, so a street tapped on the map shows its row in a long list.
 */
export function ListRows({
  rows,
  focus,
  setFocus,
}: {
  rows: { title: string; note?: string; color: string }[]
  focus: number | null
  setFocus: (i: number | null) => void
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  useEffect(() => {
    if (focus !== null) buttons.current[focus]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focus])
  return (
    <div className="flex flex-col">
      {rows.map((r, i) => (
        <button
          key={i}
          ref={(el) => {
            buttons.current[i] = el
          }}
          onClick={() => setFocus(focus === i ? null : i)}
          aria-pressed={focus === i}
          className={`flex min-h-11 items-center gap-3 rounded-lg px-2 text-left ${focus === i ? 'bg-stone-100' : 'hover:bg-stone-50'}`}
        >
          <span
            className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-extrabold text-white"
            style={{ background: r.color }}
          >
            {i + 1}
          </span>
          <span className="flex-1 font-semibold">{r.title}</span>
          {r.note && <span className="text-sm text-stone-500">{r.note}</span>}
        </button>
      ))}
    </div>
  )
}
