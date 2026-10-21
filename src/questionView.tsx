import type { Point } from 'geojson'
import type { ReactNode } from 'react'
import snailCheer from './assets/snail-cheer.webp'
import snailMap from './assets/snail-map.webp'
import routes from './data/routes.json'
import { NEUTRAL, SECTION_COLORS, TONE_COLOR, type Tone } from './palette'
import type { Question } from './round'
import { bboxOf, sectionLabel, union, type BBox, type Item, type LngLat } from './town'
import { Countdown, ListRows, Result, Verdict } from './RoundParts'
import type { Label, TownMapProps } from './TownMap'
import { Button, Kbd } from './ui'
import { AUTO_NEXT_MS, type Round, type RoundApi } from './useRound'

export type MapView = Omit<TownMapProps, 'town' | 'padding' | 'refitKey'>
/**
 * What one screen of a round shows. `prompt` is the question card (the result shows in it after
 * answering, `tone` colours its ring); `body` holds lists and answer buttons; `action` is the
 * main button. On the phone, body and action share a bottom sheet, or the action floats alone.
 */
export type View = { map: MapView; prompt: ReactNode; tone?: 'ok' | 'bad'; body?: ReactNode; action?: ReactNode }

/** `focus`: the list row tapped on an intro or summary screen, which the map zooms to. */
type Ctx = {
  round: RoundApi & { round: Round }
  overview: BBox
  desktop: boolean
  focus: number | null
  setFocus: (i: number | null) => void
}

/** The screen for the current step (intro or question), or the summary once the round is done. */
export function questionView(ctx: Ctx): View {
  const { round, desktop } = ctx
  const q = round.question
  if (!q) return summaryView(ctx)
  if (q.kind === 'intro') return introView(ctx, q)
  const { pick, selection } = round.round
  // after answering: the truck route from the Magazin. With a route, the map shows only the route
  // and `street`, as large as they fit, instead of `fit`
  const route = pick === null ? undefined : routes[routeKey(q)]
  const withRoute = (fit: BBox, street: BBox) => (route ? withMargin(union(street, bboxOf(route)), 0.001) : fit)
  const isLast = round.round.index === round.round.questions.length - 1
  const action =
    pick !== null ? (
      <Button tone="primary" onClick={round.next} autoFocus={desktop}>
        {/* a right answer moves on by itself (useRound) */}
        {round.round.results.at(-1) && <Countdown ms={AUTO_NEXT_MS} />}
        {isLast ? 'Auswertung' : 'Weiter'} {desktop && <Kbd>Enter</Kbd>}
      </Button>
    ) : (
      selection !== null && (
        // map questions: a tap only selects, «Prüfen» answers
        <Button tone="primary" onClick={round.confirm} autoFocus={desktop}>
          Prüfen {desktop && <Kbd>Enter</Kbd>}
        </Button>
      )
    )

  if (q.kind === 'section') {
    const s = q.item.sections[q.section]!
    const right = pick === q.section
    const picked = typeof pick === 'number' ? q.item.sections[pick] : undefined
    // after answering: every section in colour; asked and picked ones labelled first
    const rank = (i: number) => (i === q.section ? 2 : i === pick ? 1 : 0)
    const order = q.item.sections.map((_, i) => i).toSorted((a, b) => rank(b) - rank(a))
    return {
      map: {
        highlights: [],
        overlays: q.item.sections.map((sec, i) => ({
          key: i,
          geometry: sec.geometry,
          color: pick !== null ? SECTION_COLORS[i]! : i === selection ? TONE_COLOR.select : NEUTRAL,
        })),
        labels:
          pick === null
            ? []
            : order.map((i) => {
                const sec = q.item.sections[i]!
                const mark = i === q.section ? '✓ ' : i === pick ? '✗ ' : ''
                return { text: mark + sectionLabel(sec), color: SECTION_COLORS[i]!, at: sec.geometry }
              }),
        fit: withRoute(q.item.bbox, q.item.bbox),
        onPickOverlay: pick === null ? round.select : undefined,
        route,
      },
      tone: pick === null ? undefined : right ? 'ok' : 'bad',
      prompt: (
        <>
          {pick === null ? (
            <div className="text-sm text-stone-500">{q.item.name}</div>
          ) : (
            <Verdict right={right}>
              {right ? `Richtig – ${q.item.name}` : `Daneben – das war Nr. ${sectionLabel(picked!)}`}
            </Verdict>
          )}
          <div className="text-2xl font-bold tracking-tight">Wo liegt Nr. {sectionLabel(s)}?</div>
        </>
      ),
      action,
    }
  }

  if (q.kind === 'start') {
    const { item, ends } = q
    const right = pick === 0
    return {
      map: {
        highlights: [{ id: item.id, tone: pick === null ? 'target' : 'ok' }],
        // both ends look the same; key 0 is where the numbering starts
        overlays:
          pick === null
            ? [ends.low, ends.high].map((p, k) => ({
                key: k,
                geometry: point(p),
                color: k === selection ? TONE_COLOR.select : NEUTRAL,
              }))
            : [],
        labels:
          pick === null
            ? []
            : [
                { text: `✓ Nr. ${ends.from}`, color: TONE_COLOR.ok, at: point(ends.low) },
                {
                  text: `${right ? '' : '✗ '}Nr. ${ends.to}`,
                  color: right ? NEUTRAL : TONE_COLOR.bad,
                  at: point(ends.high),
                },
              ],
        fit: withRoute(withMargin(item.bbox, 0.002), item.bbox),
        onPickOverlay: pick === null ? round.select : undefined,
        route,
      },
      tone: pick === null ? undefined : right ? 'ok' : 'bad',
      prompt:
        pick === null ? (
          <>
            <div className="text-sm text-stone-500">{item.name}</div>
            <div className="text-2xl font-bold tracking-tight">Wo ist Nr. {ends.from}?</div>
            <div className="text-sm text-stone-500">Tippe auf ein Ende der Strasse</div>
          </>
        ) : (
          <>
            <Verdict right={right}>
              {right ? `Richtig – Nr. ${ends.from} liegt hier` : `Daneben – Nr. ${ends.from} ist am anderen Ende`}
            </Verdict>
            <div className="text-2xl font-bold tracking-tight">{item.name}</div>
            <div className="text-sm text-stone-500">
              Nr. {ends.from} bis Nr. {ends.to}
            </div>
          </>
        ),
      action,
    }
  }

  const target = q.item
  const picked = typeof pick === 'string' ? round.items.find((i) => i.id === pick) : undefined
  const wrong = picked && picked.id !== target.id ? picked : undefined
  const highlights: MapView['highlights'] = []
  if (wrong) highlights.push({ id: wrong.id, tone: 'bad', dashed: true })
  if (picked) highlights.push({ id: target.id, tone: 'ok' })
  else if (q.kind === 'name') highlights.push({ id: target.id, tone: 'target' })
  else if (typeof selection === 'string') highlights.push({ id: selection, tone: 'select' })
  const tone = picked ? (wrong ? 'bad' : 'ok') : undefined
  const shown = wrong ? union(target.bbox, wrong.bbox) : target.bbox
  const fit = withRoute(q.kind === 'name' || picked ? withMargin(shown) : ctx.overview, shown)
  // with house numbers on, a shorter street shows where its numbering starts and ends
  const labels = picked && round.settings.withNumbers ? endLabels(target) : undefined
  const what = target.kind === 'area' ? 'das Gebiet' : 'die Strasse'

  if (q.kind === 'find')
    return {
      map: { highlights, labels, fit, route, onPickItem: pick === null ? round.select : undefined },
      tone,
      prompt: picked ? (
        <Result target={target} wrong={wrong} />
      ) : (
        <>
          <div className="text-sm text-stone-500">Tippe auf {what}</div>
          <div className="text-2xl font-bold tracking-tight">{target.name}</div>
        </>
      ),
      action,
    }

  return {
    map: { highlights, labels, fit, route },
    tone,
    prompt: picked ? (
      <Result target={target} wrong={wrong} />
    ) : (
      <div className="text-2xl font-bold tracking-tight">
        Wie heisst {target.kind === 'area' ? 'das orange Gebiet' : 'die orange Strasse'}?
      </div>
    ),
    // once answered the card shows the result, so the buttons make room for the map
    body: !picked && (
      <div className="flex flex-col gap-2">
        {q.options.map((o, i) => (
          <Button key={o.id} onClick={() => round.answer(o.id)}>
            {desktop && <Kbd>{i + 1}</Kbd>}
            {o.name}
          </Button>
        ))}
      </div>
    ),
    action,
  }
}

/** New streets of the round, all at once: numbered on the map and listed; a row zooms to its street. */
function introView({ round, desktop, focus, setFocus }: Ctx, q: Extract<Question, { kind: 'intro' }>): View {
  const focused = focus === null ? undefined : q.items[focus]
  const sections = focused?.withNumbers ? focused.item.sections : []
  const labels: Label[] = q.items.flatMap(({ item }, i) =>
    i === focus ? [] : [{ text: String(i + 1), color: TONE_COLOR.target, at: item.geometry, pin: true }],
  )
  if (focused) {
    labels.unshift(
      { text: focused.item.name, color: TONE_COLOR.target, at: focused.item.geometry },
      ...sections.map((s, i) => ({ text: sectionLabel(s), color: SECTION_COLORS[i]!, at: s.geometry })),
      ...(focused.withNumbers ? endLabels(focused.item) : []),
    )
  }
  const n = q.items.length
  return {
    map: {
      highlights: q.items.map(({ item }) => ({ id: item.id, tone: 'target' })),
      overlays: sections.map((s, i) => ({ key: i, geometry: s.geometry, color: SECTION_COLORS[i]! })),
      labels,
      // all streets at once get no margin: on a phone they barely fit between card and list
      fit: focused ? withMargin(focused.item.bbox) : q.items.map((i) => i.item.bbox).reduce(union),
    },
    prompt: (
      <>
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-800">NEU</span>
          Merk dir {n === 1 ? (q.items[0]!.item.kind === 'area' ? 'dieses Gebiet' : 'diese Strasse') : 'diese Strassen'}
        </div>
        <div className="text-2xl font-bold tracking-tight">
          {n === 1 ? q.items[0]!.item.name : `${n} neue Strassen`}
        </div>
      </>
    ),
    body: (
      <ListRows
        rows={q.items.map(({ item }) => ({
          title: item.name,
          note: item.lengthM ? km(item.lengthM) : 'Gebiet',
          color: TONE_COLOR.target,
        }))}
        focus={focus}
        setFocus={setFocus}
      />
    ),
    action: (
      <Button tone="primary" onClick={round.next} autoFocus={desktop}>
        Gemerkt – los geht’s {desktop && <Kbd>Enter</Kbd>}
      </Button>
    ),
  }
}

function summaryView({ round, overview, desktop, focus, setFocus }: Ctx): View {
  const { questions, results, practice } = round.round
  const asked = questions.filter((q) => q.kind !== 'intro')
  const misses = questions.filter((_, i) => results[i] === false) as Exclude<Question, { kind: 'intro' }>[]
  const score = results.filter((r) => r === true).length
  // where a miss is pinned: its section, the end where the numbering starts, or the street
  const geometryOf = (q: (typeof misses)[number]) =>
    q.kind === 'section'
      ? q.item.sections[q.section]!.geometry
      : q.kind === 'start'
        ? point(q.ends.low)
        : q.item.geometry
  const tone = (i: number): Tone => (focus === null || focus === i ? 'bad' : 'dim')
  const focused = focus === null ? undefined : misses[focus]
  const labels: Label[] = misses.map((q, i) =>
    i === focus
      ? { text: rowTitle(q), color: TONE_COLOR.bad, at: geometryOf(q) }
      : { text: String(i + 1), color: TONE_COLOR[tone(i)], at: geometryOf(q), pin: true },
  )
  if (focused) labels.unshift(labels.splice(focus!, 1)[0]!)
  return {
    map: {
      highlights: misses.flatMap((q, i) => (q.kind === 'section' ? [] : [{ id: q.item.id, tone: tone(i) }])),
      overlays: misses.flatMap((q, i) =>
        q.kind === 'section' ? [{ key: i, geometry: geometryOf(q), color: TONE_COLOR[tone(i)] }] : [],
      ),
      labels,
      fit: focused ? withMargin(focused.item.bbox) : overview,
    },
    prompt: (
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="text-sm text-stone-500">{practice ? 'Fehler korrigiert' : 'Runde fertig'}</div>
          <div className="text-2xl font-bold tracking-tight">
            {score} / {asked.length} richtig
          </div>
          {misses.length > 0 && (
            <div className="text-xs text-stone-500">Fehler kommen in der nächsten Runde wieder.</div>
          )}
        </div>
        {/* the snail cheers for a good round and keeps studying the map otherwise */}
        <img src={score >= asked.length * 0.7 ? snailCheer : snailMap} alt="" className="h-16 w-auto" />
      </div>
    ),
    body:
      misses.length > 0 ? (
        // on a portrait phone the list scrolls on its own, so the map keeps its room
        <div className="flex flex-col gap-1 portrait:max-h-[30dvh] portrait:overflow-y-auto">
          <div className="text-xs font-semibold tracking-wider text-stone-500 uppercase">
            Deine Fehler – antippen zum Zeigen
          </div>
          <ListRows
            rows={misses.map((q, i) => ({
              title: q.item.name,
              note:
                q.kind === 'section'
                  ? `Nr. ${sectionLabel(q.item.sections[q.section]!)}`
                  : q.kind === 'start'
                    ? `Nr. ${q.ends.from}`
                    : undefined,
              color: TONE_COLOR[tone(i)],
            }))}
            focus={focus}
            setFocus={setFocus}
          />
        </div>
      ) : (
        <div>Alles richtig – stark!</div>
      ),
    action: (
      <div className="flex flex-col gap-2">
        {misses.length > 0 ? (
          <Button tone="primary" onClick={round.practiceMisses} autoFocus={desktop}>
            Fehler korrigieren ({misses.length}) {desktop && <Kbd>Enter</Kbd>}
          </Button>
        ) : (
          <Button tone="primary" onClick={round.start} autoFocus={desktop}>
            Neue Runde {desktop && <Kbd>Enter</Kbd>}
          </Button>
        )}
        <Button tone="plain" onClick={round.quit}>
          <span className="flex-1 text-center">Fertig</span> {desktop && <Kbd>Esc</Kbd>}
        </Button>
      </div>
    ),
  }
}

const rowTitle = (q: Exclude<Question, { kind: 'intro' }>) =>
  q.kind === 'section'
    ? `${q.item.name} ${sectionLabel(q.item.sections[q.section]!)}`
    : q.kind === 'start'
      ? `${q.item.name} Nr. ${q.ends.from}`
      : q.item.name

/** Which route (src/data/routes.json) leads to what a question asks. */
function routeKey(q: Exclude<Question, { kind: 'intro' }>): string {
  if (q.kind === 'section') return `${q.item.id}:${q.section}`
  if (q.kind === 'start') return `${q.item.id}:start`
  return q.item.id
}

/** «Nr. 1» and «Nr. 42» at the ends of a shorter street, so you learn where its numbering starts. */
const endLabels = ({ ends }: Item): Label[] =>
  ends
    ? [
        { text: `Nr. ${ends.from}`, color: NEUTRAL, at: point(ends.low) },
        { text: `Nr. ${ends.to}`, color: NEUTRAL, at: point(ends.high) },
      ]
    : []

const point = (coordinates: LngLat): Point => ({ type: 'Point', coordinates })

const km = (m: number) => `${(m / 1000).toFixed(1).replace('.', ',')} km`

/** Room around a street so it shows in context (0.0025° ≈ 280 m; lng counts 1.5×, its degrees are shorter here). */
function withMargin([w, s, e, n]: BBox, deg = 0.0025): BBox {
  return [w - deg * 1.5, s - deg, e + deg * 1.5, n + deg]
}
