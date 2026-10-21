import type { ReactNode } from 'react'
import type { TownMapProps } from './TownMap'
import type { useProgress } from './progress'

export type Progress = ReturnType<typeof useProgress>

/** What a mode shows: map state, the floating prompt card and the bottom sheet. */
export type ModeView = {
  map: Omit<TownMapProps, 'town'>
  prompt: ReactNode
  sheet: ReactNode
}

/** iOS-style segmented control. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-stone-200/80 p-1 backdrop-blur">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-1 py-1.5 text-[13px] font-semibold tracking-tight whitespace-nowrap ${
            o.value === value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-white px-4 py-3 shadow-md">{children}</div>
}

export function ProgressRow({ today, learned, total }: { today: number; learned: number; total: number }) {
  return (
    <div className="flex justify-between text-xs text-stone-500">
      <span>Heute {today} beantwortet</span>
      <span>
        Gelernt {learned} / {total}
      </span>
    </div>
  )
}

export function Button({
  children,
  onClick,
  tone = 'plain',
}: {
  children: ReactNode
  onClick: () => void
  tone?: 'plain' | 'primary' | 'ok' | 'bad'
}) {
  const tones = {
    plain: 'bg-stone-100 text-stone-900',
    primary: 'bg-red-600 text-white',
    ok: 'bg-green-100 text-green-900 ring-2 ring-green-600',
    bad: 'bg-red-100 text-red-900',
  }
  return (
    <button onClick={onClick} className={`rounded-xl px-4 py-3 text-left font-semibold ${tones[tone]}`}>
      {children}
    </button>
  )
}
