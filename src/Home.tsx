import { useState } from 'react'
import type { Backup } from './backup'
import { BackupPanel } from './BackupPanel'
import { t } from './i18n'
import { InstallHint } from './InstallHint'
import { progressCounts, type Progress } from './progress'
import { ROUND_SIZE, type Mode } from './round'
import { Button, Kbd, ProgressBar, Switch } from './ui'
import type { RoundApi } from './useRound'

/** The modes in button order; their labels and hints live in `t.home.modes`. */
export const MODES = [
  {
    value: 'find',
    icon: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  },
  {
    value: 'name',
    icon: 'M3 12V4h8l10 10-8 8zM7.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  },
] as const satisfies readonly { value: Mode; icon: string }[]

/**
 * Start screen, sized to fit a phone without scrolling: in iOS Safari a tip to install the app; one
 * card with the mode switch, what the next round brings, the progress for that mode and «Runde
 * starten»; the options; the backup line. Settings live only here, so a round never changes under you.
 */
export function Home({
  round,
  progress,
  backup,
  keyboard,
}: {
  round: RoundApi
  progress: Progress
  backup: Backup
  keyboard: boolean
}) {
  const { mode, withNumbers, intro } = round.settings
  const counts = progressCounts(round.keys, progress.cards)
  const [now] = useState(Date.now) // the start screen is fresh after every round
  const due = round.keys.filter((k) => (progress.cards[k]?.due ?? Infinity) <= now).length
  const headline = due > 0 ? t.home.due(due) : counts.fresh > 0 ? t.home.learnNew : t.home.allLearned

  return (
    <div className="flex flex-col gap-4">
      <InstallHint />
      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
        {/* the mode switch heads the card: next round and progress below belong to that mode */}
        <div className="grid grid-cols-2 rounded-xl bg-stone-100 p-1" role="radiogroup" aria-label={t.home.mode}>
          {MODES.map((m) => (
            <button
              key={m.value}
              role="radio"
              aria-checked={m.value === mode}
              aria-label={`${t.home.modes[m.value].label}: ${t.home.modes[m.value].hint}`}
              onClick={() => round.configure({ mode: m.value })}
              className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold ${
                m.value === mode ? 'bg-white shadow-sm' : 'text-stone-500'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4 shrink-0"
                fill="none"
                stroke={m.value === mode ? '#dc2626' : '#78716c'}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={m.icon} />
              </svg>
              {t.home.modes[m.value].hint}
            </button>
          ))}
        </div>
        <div>
          <div className="text-sm text-stone-500">{t.home.nextRound}</div>
          <div className="text-2xl font-bold tracking-tight">{headline}</div>
          <div className="text-sm text-stone-600">{t.home.questions(ROUND_SIZE, due > 0 && counts.fresh > 0)}</div>
        </div>
        <ProgressBar today={progress.today} {...counts} />
        <Button tone="primary" onClick={round.start} autoFocus={keyboard}>
          {t.home.start} {keyboard && <Kbd>Enter</Kbd>}
        </Button>
      </section>

      <section className="flex flex-col rounded-2xl bg-white px-4 py-1 shadow-sm">
        <Switch checked={withNumbers} onChange={(withNumbers) => round.configure({ withNumbers })} wide>
          <span className="text-left">
            <span className="block text-sm font-semibold">{t.home.numbers}</span>
            <span className="block text-xs text-stone-500">{t.home.numbersHint}</span>
          </span>
        </Switch>
        <Switch checked={intro} onChange={(intro) => round.configure({ intro })} wide>
          <span className="text-left">
            <span className="block text-sm font-semibold">{t.home.intro}</span>
            <span className="block text-xs text-stone-500">{t.home.introHint}</span>
          </span>
        </Switch>
      </section>

      <BackupPanel backup={backup} />
    </div>
  )
}
