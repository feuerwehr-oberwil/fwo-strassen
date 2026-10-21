import { Suspense, use, useEffect, useMemo, type ReactNode } from 'react'
import { useBackup } from './backup'
import { BackupPanel } from './BackupPanel'
import { progressCounts, useProgress } from './progress'
import { questionView, type MapView } from './questionView'
import type { Mode } from './round'
import { streetsBBox, type Town } from './town'
import { TownMap, type Padding } from './TownMap'
import { ProgressBar, RoundDots, Segmented, Switch } from './ui'
import { useMediaQuery } from './useMediaQuery'
import { useRound, type RoundApi } from './useRound'

const MODES = [
  { value: 'find', label: 'Strasse finden', hint: 'Name → Karte' },
  { value: 'name', label: 'Strasse benennen', hint: 'Karte → Name' },
] as const satisfies readonly { value: Mode; label: string; hint: string }[]

// Loaded once at startup (kept out of town.ts so tests can import it without a fetch).
const townPromise: Promise<Town> = fetch(`${import.meta.env.BASE_URL}oberwil.json`).then(
  (r) => r.json() as Promise<Town>,
)

const PHONE_PADDING: Padding = { top: 170, bottom: 24, left: 24, right: 24 }
const DESKTOP_PADDING: Padding = { top: 48, bottom: 48, left: 48, right: 48 }

export default function App() {
  return (
    <Suspense fallback={<div className="grid h-dvh place-items-center text-stone-500">Karte wird geladen …</div>}>
      <Trainer />
    </Suspense>
  )
}

// Phone: map with the question on top and answers in a bottom sheet.
// Desktop (≥ 1024 px): sidebar with modes, question and progress; map on the right.
function Trainer() {
  const town = use(townPromise)
  const progress = useProgress()
  const backup = useBackup(progress)
  const round = useRound(town, progress)
  const desktop = useMediaQuery('(min-width: 1024px)')
  const overview = useMemo(() => streetsBBox(town.items), [town])
  const view = questionView({ round, overview, desktop })
  useKeyboard(round)

  const map = (padding: Padding) => (
    <TownMap
      town={town}
      padding={padding}
      refitKey={`${round.round.id}:${round.round.index}`}
      {...(view.map satisfies MapView)}
    />
  )
  const dots = <RoundDots results={round.round.results} total={round.round.questions.length} />
  const learned = (
    <div className="flex flex-col gap-3">
      <ProgressBar today={progress.today} {...progressCounts(round.keys, progress.cards)} />
      <BackupPanel backup={backup} />
    </div>
  )
  const numbersSwitch = (label: ReactNode) => (
    <Switch checked={round.settings.withNumbers} onChange={(withNumbers) => round.configure({ withNumbers })}>
      {label}
    </Switch>
  )

  if (desktop)
    return (
      <main className="flex h-dvh text-stone-900">
        <aside className="flex w-[400px] shrink-0 flex-col border-r border-stone-200 bg-white">
          <div className="px-6 pt-6 pb-4">
            <div className="text-xs font-semibold tracking-wider text-red-600 uppercase">Feuerwehr Oberwil</div>
            <div className="text-xl font-bold">Strassen-Trainer</div>
          </div>
          <nav className="flex flex-col gap-0.5 px-3">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => round.configure({ mode: m.value })}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-left ${
                  m.value === round.settings.mode ? 'bg-stone-100' : 'hover:bg-stone-50'
                }`}
              >
                <div>
                  <div className={`font-semibold ${m.value === round.settings.mode ? '' : 'text-stone-600'}`}>
                    {m.label}
                  </div>
                  <div className="text-xs text-stone-500">{m.hint}</div>
                </div>
                {m.value === round.settings.mode && <span className="size-2 rounded-full bg-red-600" />}
              </button>
            ))}
          </nav>
          <div className="px-6 py-3">
            {numbersSwitch(
              <span className="text-left">
                <span className="block text-sm font-semibold">Hausnummern</span>
                <span className="block text-xs text-stone-500">Abschnitte langer Strassen mit abfragen</span>
              </span>,
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto border-t border-stone-100 px-6 py-5">
            {dots}
            <div>{view.prompt}</div>
            {view.body}
          </div>
          <div className="border-t border-stone-100 px-6 py-4">{learned}</div>
        </aside>
        <div className="relative flex-1">{map(DESKTOP_PADDING)}</div>
      </main>
    )

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-stone-100 text-stone-900">
      <div className="relative flex-1">
        {map(PHONE_PADDING)}
        <div className="pointer-events-none absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] flex flex-col gap-2 *:pointer-events-auto">
          <div className="flex items-center gap-2">
            <Segmented
              options={MODES.map((m) => ({ value: m.value, label: m.label.replace('Strasse ', '') }))}
              value={round.settings.mode}
              onChange={(mode) => round.configure({ mode })}
            />
            <div className="rounded-xl bg-white/90 px-2 py-1.5 shadow-sm backdrop-blur">
              {numbersSwitch(<span className="text-[13px] font-semibold">Nr.</span>)}
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-2xl bg-white px-4 py-3 shadow-md">
            {dots}
            <div>{view.prompt}</div>
          </div>
        </div>
      </div>
      <div className="z-10 flex flex-col gap-2 rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_#0002]">
        {view.body}
        {!round.question && learned}
      </div>
    </main>
  )
}

/** Enter = next question / new round, 1–4 = answer options in «Strasse benennen». */
function useKeyboard(round: RoundApi) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const q = round.question
      if (e.target instanceof HTMLInputElement) return // typing a backup code
      if (e.key === 'Enter') {
        e.preventDefault() // don't also "click" the focused button
        if (!q) round.restart()
        else round.next()
      } else if (q?.kind === 'name' && /^[1-4]$/.test(e.key)) {
        const option = q.options[Number(e.key) - 1]
        if (option) round.answer(option.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [round])
}
