import { useState } from 'react'
import type { Backup } from './backup'
import { BackupPanel } from './BackupPanel'
import { InstallHint } from './InstallHint'
import { progressCounts, type Progress } from './progress'
import type { Mode } from './round'
import { Button, Kbd, ProgressBar, Switch } from './ui'
import type { RoundApi } from './useRound'

export const MODES = [
  {
    value: 'find',
    label: 'Finden',
    hint: 'Name → Karte',
    icon: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  },
  {
    value: 'name',
    label: 'Benennen',
    hint: 'Karte → Name',
    icon: 'M3 12V4h8l10 10-8 8zM7.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  },
] as const satisfies readonly { value: Mode; label: string; hint: string; icon: string }[]

/**
 * Start screen: in iOS Safari a tip to install the app, what the next round brings, the «Runde starten» button, mode and options, and the
 * progress for the chosen mode. Settings live only here, so a round never changes under you.
 */
export function Home({
  round,
  progress,
  backup,
  desktop,
}: {
  round: RoundApi
  progress: Progress
  backup: Backup
  desktop: boolean
}) {
  const { mode, withNumbers, intro } = round.settings
  const counts = progressCounts(round.keys, progress.cards)
  const [now] = useState(Date.now) // the start screen is fresh after every round
  const due = round.keys.filter((k) => (progress.cards[k]?.due ?? Infinity) <= now).length
  const headline =
    due > 0
      ? `${due} ${due === 1 ? 'Wiederholung' : 'Wiederholungen'} fällig`
      : counts.fresh > 0
        ? 'Neue Strassen lernen'
        : 'Alles gelernt'
  const modeLabel = MODES.find((m) => m.value === mode)!.label

  return (
    <div className="flex flex-col gap-4">
      <InstallHint />
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="text-sm text-stone-500">Nächste Runde</div>
        <div className="text-2xl font-bold tracking-tight">{headline}</div>
        <div className="mb-3 text-sm text-stone-600">
          10 Fragen{due > 0 && counts.fresh > 0 ? ', dazu neue Strassen' : ''}
        </div>
        <Button tone="primary" onClick={round.start} autoFocus={desktop}>
          Runde starten {desktop && <Kbd>Enter</Kbd>}
        </Button>
      </section>

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Modus">
        {MODES.map((m) => (
          <button
            key={m.value}
            role="radio"
            aria-checked={m.value === mode}
            onClick={() => round.configure({ mode: m.value })}
            className={`flex flex-col items-start rounded-2xl bg-white p-3 text-left shadow-sm ${
              m.value === mode ? 'ring-2 ring-stone-900' : 'text-stone-600'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="mb-1 size-6"
              fill="none"
              stroke={m.value === mode ? '#dc2626' : '#78716c'}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={m.icon} />
            </svg>
            <span className="font-bold">{m.label}</span>
            <span className="text-xs text-stone-500">{m.hint}</span>
          </button>
        ))}
      </div>

      <section className="flex flex-col rounded-2xl bg-white px-4 py-1 shadow-sm">
        <Switch checked={withNumbers} onChange={(withNumbers) => round.configure({ withNumbers })} wide>
          <span className="text-left">
            <span className="block text-sm font-semibold">Hausnummern</span>
            <span className="block text-xs text-stone-500">
              Abschnitte langer Strassen, bei kürzeren wo Nr. 1 liegt
            </span>
          </span>
        </Switch>
        <Switch checked={intro} onChange={(intro) => round.configure({ intro })} wide>
          <span className="text-left">
            <span className="block text-sm font-semibold">Neue Strassen vorstellen</span>
            <span className="block text-xs text-stone-500">Zuerst zeigen, dann abfragen</span>
          </span>
        </Switch>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">
          Fortschritt · {modeLabel}
          {withNumbers && ' mit Hausnummern'}
        </div>
        <ProgressBar today={progress.today} {...counts} />
      </section>

      <BackupPanel backup={backup} />
    </div>
  )
}
