import type { ReactNode } from 'react'
import { t } from './i18n'
import { TONE_COLOR, type Tone } from './palette'
import { distanceM, type Item } from './town'

// Small pieces of the round screens (questionView.tsx).

/** The answer inside the question card: what was asked (green line) and, if wrong, your tap (dashed red). */
export function Result({ target, wrong }: { target: Item; wrong: Item | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <Verdict right={!wrong}>{wrong ? t.question.wrong(distanceM(target, wrong)) : t.question.right}</Verdict>
      <LineRow tone="ok" name={target.name} note={wrong && t.question.target} big />
      {wrong && <LineRow tone="bad" dashed name={wrong.name} note={t.question.yourTap} />}
    </div>
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
      <span className={big ? 'text-2xl font-bold tracking-tight' : 'font-semibold text-stone-700'}>{name}</span>
      {note && <span className="text-xs text-stone-500">{note}</span>}
    </div>
  )
}

/** Numbered rows matching the pins on the map; tapping one focuses it, tapping it again lets go. */
export function ListRows({
  rows,
  focus,
  setFocus,
}: {
  rows: { title: string; note?: string; color: string }[]
  focus: number | null
  setFocus: (i: number | null) => void
}) {
  return (
    <div className="flex flex-col">
      {rows.map((r, i) => (
        <button
          key={i}
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
