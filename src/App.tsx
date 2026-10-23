import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import snailMap from './assets/snail-map.webp'
import { useBackup } from './backup'
import { Home } from './Home'
import { t } from './i18n'
import { useProgress } from './progress'
import { questionView, type MapView, type View } from './questionView'
import { coreBBox } from './town'
import type { TownData } from './townData'
import { TownMap, UI_GAP, type Padding } from './TownMap'
import { RoundDots } from './ui'
import { useMediaQuery } from './useMediaQuery'
import { useRound, type RoundApi } from './useRound'

/** Phone: the smallest height (px) the fitted box gets between question card and bottom sheet. */
const MIN_MAP = 160

/**
 * Start screen, then rounds, for the town in `data` (loaded once by main.tsx). Phone (portrait): full-screen map with the question card on top and
 * answers or the main button at the bottom; the start screen covers the map. Desktop (≥ 1024 px)
 * and landscape phones/tablets: a sidebar (left, or right on small landscape screens) next to the map.
 */
export default function App({ data }: { data: TownData }) {
  const { town, routes, basemap, config } = data
  const overview = useMemo(() => coreBBox(town.items), [town])
  // the Hauptachsen (region.json), labelled on the map as points of reference
  const axes = useMemo(() => town.items.filter((i) => config.axes.includes(i.name)), [town, config.axes])
  const progress = useProgress()
  const backup = useBackup(progress, config.name)
  const round = useRound(town, progress)
  const wide = useMediaQuery('(min-width: 1024px)')
  const landscape = useMediaQuery('(orientation: landscape) and (min-width: 568px)')
  const side = wide || landscape
  // key hints and autofocus follow the input, not the width: none on an iPad, all in a narrow desktop window
  const keyboard = useMediaQuery('(hover: hover) and (pointer: fine)')

  // the list row in focus on intro and summary screens; resets with every step. `fromMap`: picked by
  // tapping its street, so the map stays where it is instead of zooming to it
  const step = round.round ? `${round.round.id}:${round.round.index}` : 'home'
  const [focusState, setFocusState] = useState({ step, value: null as number | null, fromMap: false })
  const current = focusState.step === step
  const focus = current ? focusState.value : null
  const focusFromMap = current && focusState.fromMap
  const setFocus = (value: number | null, fromMap = false) => setFocusState({ step, value, fromMap })
  const [recentred, setRecentred] = useState(0)
  // the map's rotation (degrees); the compass shows while it is off north and turns it back
  const [bearing, setBearing] = useState(0)
  const [northed, setNorthed] = useState(0)

  const view =
    round.round &&
    questionView({
      round: { ...round, round: round.round },
      routes,
      overview,
      axes,
      keyboard,
      focus,
      focusFromMap,
      setFocus,
    })
  useKeyboard(round)

  const mapBox = useRef<HTMLDivElement>(null)
  const topUi = useRef<HTMLDivElement>(null)
  const bottomUi = useRef<HTMLDivElement>(null)
  const mapButtons = useRef<HTMLDivElement>(null)
  // keep the fitted box clear of the question card and the bottom sheet, whatever their height
  const padding = (): Padding => {
    const box = mapBox.current?.getBoundingClientRect()
    if (side || !box) {
      const p = wide ? UI_GAP * 3 : UI_GAP * 1.5
      return { top: p, bottom: p, left: p, right: p }
    }
    const top = (topUi.current?.getBoundingClientRect().bottom ?? box.top) - box.top + UI_GAP
    // the map buttons float above the sheet; keep them off the route's ends too
    const sheetTop = Math.min(
      bottomUi.current?.getBoundingClientRect().top ?? box.bottom,
      mapButtons.current?.getBoundingClientRect().top ?? box.bottom,
    )
    const bottom = box.bottom - sheetTop + UI_GAP
    // a tall sheet (many misses) may cover part of the fit, but the map keeps at least MIN_MAP px
    return { top, bottom: Math.min(bottom, box.height - top - MIN_MAP), left: UI_GAP, right: UI_GAP }
  }

  const map = (
    <div ref={mapBox} className="absolute inset-0">
      <TownMap
        town={town}
        baseStyle={basemap}
        padding={padding}
        refitKey={`${step}:${focusFromMap ? 'map' : focus}:${recentred}`}
        onBearing={setBearing}
        northKey={northed}
        {...((view?.map ?? { highlights: [], fit: overview }) satisfies MapView)}
      />
    </div>
  )
  const mapButton = 'pointer-events-auto grid size-11 place-items-center rounded-xl bg-white text-stone-700 shadow-md'
  // compass (only while the map is turned) above the reset button
  const mapControls = (className: string) => (
    <div ref={mapButtons} className={`flex flex-col gap-2 ${className}`}>
      {bearing !== 0 && (
        <button onClick={() => setNorthed((n) => n + 1)} aria-label={t.north} title={t.north} className={mapButton}>
          <svg
            viewBox="0 0 24 24"
            className="size-6 transition-transform"
            style={{ transform: `rotate(${-bearing}deg)` }}
            aria-hidden="true"
          >
            <path d="M12 2l4.5 10h-9z" fill="#dc2626" />
            <path d="M12 22l-4.5-10h9z" fill="#a8a29e" />
          </svg>
        </button>
      )}
      {recentre}
    </div>
  )
  const recentre = (
    <button onClick={() => setRecentred((n) => n + 1)} aria-label={t.recentre} title={t.recentre} className={mapButton}>
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      </svg>
    </button>
  )
  const quit = (
    <button
      onClick={round.quit}
      aria-label={t.quit}
      title={t.quit}
      className="-m-2 grid size-11 shrink-0 place-items-center text-xl text-stone-500"
    >
      ✕
    </button>
  )
  const header = (
    <div className="flex items-center gap-3">
      <img src={snailMap} alt="" className="h-14 w-auto" />
      <div>
        <div className="text-xs font-semibold tracking-wider text-red-600 uppercase">{config.brand}</div>
        <div className="text-xl font-bold">{t.appName}</div>
      </div>
    </div>
  )
  const home = <Home round={round} progress={progress} backup={backup} keyboard={keyboard} />
  // map from swisstopo, truck routes from OpenStreetMap (pipeline/routes.ts)
  const credit = (
    <span className="pointer-events-auto self-end rounded bg-white/80 px-1 text-[10px] text-stone-500">
      <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noreferrer">
        © swisstopo
      </a>{' '}
      ·{' '}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        © OpenStreetMap
      </a>
    </span>
  )

  if (side)
    return (
      <main className={`flex h-dvh text-stone-900 ${wide ? '' : 'flex-row-reverse'}`}>
        <aside
          className={`flex shrink-0 flex-col overflow-y-auto ${view ? 'bg-white' : 'bg-stone-100'} ${
            wide
              ? 'w-[400px] gap-4 border-r p-6'
              : // landscape phones are short: smaller headings and buttons, so four answers fit
                'w-[340px] gap-2 border-l p-2 pr-[max(0.5rem,env(safe-area-inset-right))] [&_.min-h-11]:min-h-9 [&_.min-h-12]:min-h-10 [&_.min-h-12]:py-2 [&_.text-2xl]:text-lg'
          } border-stone-200`}
        >
          {(wide || !view) && header}
          {view ? (
            <>
              <QuestionCard view={view} round={round} quit={quit} />
              {view.body && <div className="rounded-2xl bg-white p-2 shadow-sm">{view.body}</div>}
              {view.action}
            </>
          ) : (
            home
          )}
        </aside>
        <div className="relative flex-1">
          {map}
          {view && mapControls('absolute top-3 right-3')}
          <div className="absolute right-1 bottom-1 flex">{credit}</div>
        </div>
      </main>
    )

  return (
    <main className="relative h-dvh overflow-hidden bg-stone-100 text-stone-900">
      {map}
      {view ? (
        <>
          <div
            ref={topUi}
            className="pointer-events-none absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] *:pointer-events-auto"
          >
            <QuestionCard view={view} round={round} quit={quit} />
          </div>
          <div ref={bottomUi} className="pointer-events-none absolute inset-x-0 bottom-0">
            {mapControls('absolute right-3 bottom-[calc(100%+0.75rem)]')}
            {view.body ? (
              // a bit denser than elsewhere (list rows 36 px), so the map keeps more room
              <div className="pointer-events-auto flex max-h-[55dvh] flex-col gap-2 overflow-y-auto rounded-t-2xl bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_#0002] [&_.min-h-11]:min-h-9">
                {view.body}
                {view.action}
                {credit}
              </div>
            ) : (
              // keeps its height without a button, so «Prüfen» appearing never moves the map
              <div className="flex flex-col gap-1 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                <div className="min-h-12 *:pointer-events-auto *:shadow-lg">{view.action}</div>
                {credit}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="absolute inset-0 overflow-y-auto bg-stone-100">
          <div className="mx-auto flex max-w-md flex-col gap-4 p-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {header}
            {home}
          </div>
        </div>
      )}
    </main>
  )
}

/** The question (and after answering, the result) with ✕ and the round's progress bars. */
function QuestionCard({ view, round, quit }: { view: View; round: RoundApi; quit: ReactNode }) {
  const r = round.round!
  const ring = view.tone === 'ok' ? 'ring-2 ring-green-600' : view.tone === 'bad' ? 'ring-2 ring-red-500' : ''
  // intros are not scored, so the bars count questions only
  const asked = (qs: typeof r.questions) => qs.filter((q) => q.kind !== 'intro').length
  const total = asked(r.questions)
  const current = Math.max(1, asked(r.questions.slice(0, r.index + 1)))
  const results = r.results.filter((x): x is boolean => x !== null)
  return (
    <div className={`flex flex-col gap-2 rounded-2xl bg-white px-4 py-3 shadow-md ${ring}`}>
      <div className="flex items-center gap-3">
        {quit}
        <div className="flex-1">
          <RoundDots results={results} total={total} />
        </div>
        <span className="text-xs font-semibold text-stone-500 tabular-nums">
          {current}/{total}
        </span>
      </div>
      <div>{view.prompt}</div>
    </div>
  )
}

/**
 * Keyboard: Enter = Runde starten / Prüfen / Weiter / Fehler korrigieren, Esc = Runde beenden,
 * 1–4 = answer in «Benennen», 0 = Weiss nicht. Keys typed on a focused control keep their normal meaning.
 */
function useKeyboard(round: RoundApi) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return
      if (e.target instanceof Element && e.target.closest('button, input, select, textarea, a')) return
      const r = round.round
      const q = round.question
      if (e.key === 'Escape' && r) round.quit()
      else if (e.key === 'Enter') {
        if (!r) round.start()
        else if (!q) {
          if (r.results.includes(false)) round.practiceMisses()
          else round.start()
        } else if (r.selection !== null) round.confirm()
        else round.next()
      } else if (q && q.kind !== 'intro' && r?.pick === null && e.key === '0') round.giveUp()
      else if (q?.kind === 'name' && /^[1-4]$/.test(e.key)) {
        const option = q.options[Number(e.key) - 1]
        if (option) round.answer(option.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [round])
}
