import type { ReactNode } from 'react'

export function Button({
  children,
  onClick,
  tone = 'plain',
  disabled = false,
  autoFocus = false,
}: {
  children: ReactNode
  onClick: () => void
  tone?: 'plain' | 'primary'
  disabled?: boolean
  /** Focus the button when it appears, so Enter activates it. */
  autoFocus?: boolean
}) {
  const tones = {
    plain: 'bg-stone-100 text-stone-900 hover:bg-stone-200',
    primary: 'justify-center bg-red-600 text-white hover:bg-red-700',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      className={`relative flex min-h-12 w-full items-center overflow-hidden gap-3 rounded-xl px-4 py-3 text-left font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:cursor-default ${tones[tone]}`}
    >
      {children}
    </button>
  )
}

/** On/off switch with a label, e.g. "Hausnummern"; `wide` puts the label left and the switch right. */
export function Switch({
  checked,
  onChange,
  wide = false,
  children,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  wide?: boolean
  children: ReactNode
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex min-h-11 items-center gap-2 ${wide ? 'w-full flex-row-reverse justify-between py-2' : ''}`}
    >
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
  const label = `Frage ${Math.min(results.length + 1, total)} von ${total}, ${results.filter(Boolean).length} richtig`
  return (
    <div className="flex gap-1" role="img" aria-label={label}>
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

/** Three-part bar: sicher (3× right in a row) · am Lernen (seen) · neu. */
export function ProgressBar({
  today,
  solid,
  learning,
  fresh,
}: {
  today: number
  solid: number
  learning: number
  fresh: number
}) {
  const total = solid + learning + fresh
  const pct = (n: number) => `${(n / total) * 100}%`
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2 overflow-hidden rounded-full bg-stone-200">
        <div className="bg-green-600" style={{ width: pct(solid) }} />
        <div className="bg-amber-400" style={{ width: pct(learning) }} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
        <Legend color="bg-green-600">{solid} sicher</Legend>
        <Legend color="bg-amber-400">{learning} am Lernen</Legend>
        <Legend color="bg-stone-300">{fresh} neu</Legend>
        <span className="ml-auto">heute {today} beantwortet</span>
      </div>
    </div>
  )
}

function Legend({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`size-2 rounded-full ${color}`} />
      {children}
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-stone-300 bg-white px-1.5 text-xs font-normal text-stone-500">{children}</kbd>
  )
}
