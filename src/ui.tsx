import type { ReactNode } from 'react'

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
    <div className="flex flex-1 gap-1 rounded-xl bg-stone-200/80 p-1 backdrop-blur">
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
    plain: 'bg-stone-100 text-stone-900 hover:bg-stone-200',
    primary: 'justify-center bg-red-600 text-white hover:bg-red-700',
    ok: 'bg-green-100 text-green-900 ring-2 ring-green-600',
    bad: 'bg-red-100 text-red-900',
  }
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left font-semibold ${tones[tone]}`}
    >
      {children}
    </button>
  )
}

/** On/off switch with a label, e.g. "Hausnummern". */
export function Switch({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
}) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center gap-2">
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition ${checked ? 'bg-red-600' : 'bg-stone-300'}`}>
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
      {children}
    </button>
  )
}

/** One bar per question of the round: green right, red wrong, dark = current. */
export function RoundDots({ results, total }: { results: boolean[]; total: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-full ${
            i < results.length
              ? results[i]
                ? 'bg-green-600'
                : 'bg-red-500'
              : i === results.length
                ? 'bg-stone-800'
                : 'bg-stone-200'
          }`}
        />
      ))}
    </div>
  )
}

export function ProgressRow({ today, learned, total }: { today: number; learned: number; total: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-xs text-stone-500">
        <span>Heute {today} beantwortet</span>
        <span>
          Gelernt {learned} / {total}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full bg-green-600" style={{ width: `${(learned / total) * 100}%` }} />
      </div>
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-stone-300 bg-white px-1.5 text-xs font-normal text-stone-500">{children}</kbd>
  )
}
