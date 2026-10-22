import type { Point } from 'geojson'
import type { ReactNode } from 'react'
import snailCheer from './assets/snail-cheer.webp'
import snailMap from './assets/snail-map.webp'
import { t } from './i18n'
import { NEUTRAL, SECTION_COLORS, TONE_COLOR, type Tone } from './palette'
import type { Question } from './round'
import {
  bboxOf,
  distanceM,
  sectionKey,
  sectionLabel,
  union,
  type BBox,
  type Item,
  type LngLat,
  type Routes,
} from './town'
import { Countdown, ListRows, Result, Verdict } from './RoundParts'
import type { Label, TownMapProps } from './TownMap'
import { Button, Kbd } from './ui'
import { AUTO_NEXT_MS, type Pick, type Round, type RoundApi } from './useRound'

export type MapView = Omit<TownMapProps, 'town' | 'baseStyle' | 'padding' | 'refitKey'>
/**
 * What one screen of a round shows. `prompt` is the question card (the result shows in it after
 * answering, `tone` colours its ring); `body` holds lists and answer buttons; `action` is the
 * main button. On the phone, body and action share a bottom sheet, or the action floats alone.
 */
export type View = { map: MapView; prompt: ReactNode; tone?: 'ok' | 'bad'; body?: ReactNode; action?: ReactNode }

/**
 * `focus`: the list row selected on an intro or summary screen, by tapping the row (the map zooms to
 * it) or its street on the map (`focusFromMap`: the map stays put). `keyboard`: a mouse is the main
 * input, so buttons show their keys and the main one takes focus for Enter.
 */
type Ctx = {
  round: RoundApi & { round: Round }
  routes: Routes
  overview: BBox
  keyboard: boolean
  focus: number | null
  focusFromMap: boolean
  setFocus: (i: number | null, fromMap?: boolean) => void
}

type Asked = Exclude<Question, { kind: 'intro' }>

/** The screen for the current step (intro or question), or the summary once the round is done. */
export function questionView(ctx: Ctx): View {
  const q = ctx.round.question
  if (!q) return summaryView(ctx)
  if (q.kind === 'intro') return introView(ctx, q)
  return askView(ctx, q, ctx.round.round.pick, ctx.round.round.selection)
}

/**
 * A question before and after answering (`pick`). The summary shows a past question with its
 * pick again; there only `map` and `prompt` are used.
 */
function askView(ctx: Ctx, q: Asked, pick: Pick | null, selection: Pick | null): View {
  const { round, routes, keyboard } = ctx
  // after answering: the truck route from the Magazin. With a route, the map shows only the route
  // and `street`, as large as they fit, instead of `fit`
  const route = pick === null ? undefined : routes[routeKey(q)]
  const withRoute = (fit: BBox, street: BBox) => (route ? withMargin(union(street, bboxOf(route)), 0.001) : fit)
  const isLast = round.round.index === round.round.questions.length - 1
  const action =
    pick !== null ? (
      <Button tone="primary" onClick={round.next} autoFocus={keyboard}>
        {/* a right answer moves on by itself (useRound) */}
        {round.round.results.at(-1) && <Countdown ms={AUTO_NEXT_MS} />}
        {isLast ? t.question.results : t.question.next} {keyboard && <Kbd>Enter</Kbd>}
      </Button>
    ) : (
      selection !== null && (
        // map questions: a tap only selects, «Prüfen» answers
        <Button tone="primary" onClick={round.confirm} autoFocus={keyboard}>
          {t.question.check} {keyboard && <Kbd>Enter</Kbd>}
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
              {right ? t.question.sectionRight(q.item.name) : t.question.sectionWrong(sectionLabel(picked!))}
            </Verdict>
          )}
          <div className="text-2xl font-bold tracking-tight">{t.question.whereSection(sectionLabel(s))}</div>
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
                { text: `✓ ${t.question.nr(ends.from)}`, color: TONE_COLOR.ok, at: point(ends.low) },
                {
                  text: `${right ? '' : '✗ '}${t.question.nr(ends.to)}`,
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
            <div className="text-2xl font-bold tracking-tight">{t.question.whereStart(ends.from)}</div>
            <div className="text-sm text-stone-500">{t.question.tapEnd}</div>
          </>
        ) : (
          <>
            <Verdict right={right}>
              {right ? t.question.startRight(ends.from) : t.question.startWrong(ends.from)}
            </Verdict>
            <div className="text-2xl font-bold tracking-tight">{item.name}</div>
            <div className="text-sm text-stone-500">{t.question.range(ends.from, ends.to)}</div>
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

  if (q.kind === 'find')
    return {
      map: { highlights, labels, fit, route, onPickItem: pick === null ? round.select : undefined },
      tone,
      prompt: picked ? (
        <Result target={target} wrong={wrong} />
      ) : (
        <>
          <div className="text-sm text-stone-500">{t.question.tap(target.kind)}</div>
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
      <div className="text-2xl font-bold tracking-tight">{t.question.name(target.kind)}</div>
    ),
    // once answered the card shows the result, so the buttons make room for the map
    body: !picked && (
      <div className="flex flex-col gap-2">
        {q.options.map((o, i) => (
          <Button key={o.id} onClick={() => round.answer(o.id)}>
            {keyboard && <Kbd>{i + 1}</Kbd>}
            {o.name}
          </Button>
        ))}
      </div>
    ),
    action,
  }
}

/**
 * New streets of the round, all at once: numbered on the map and listed. A row zooms to its street;
 * tapping a street on the map selects its row and names it there.
 */
function introView(
  { round, keyboard, focus, focusFromMap, setFocus }: Ctx,
  q: Extract<Question, { kind: 'intro' }>,
): View {
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
      fit: focused && !focusFromMap ? withMargin(focused.item.bbox) : q.items.map((i) => i.item.bbox).reduce(union),
      onPickItem: (id) => {
        const i = q.items.findIndex(({ item }) => item.id === id)
        if (i >= 0) setFocus(i === focus ? null : i, true)
      },
    },
    prompt: (
      <>
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-800">
            {t.intro.badge}
          </span>
          {t.intro.remember(n, q.items[0]!.item.kind)}
        </div>
        <div className="text-2xl font-bold tracking-tight">{n === 1 ? q.items[0]!.item.name : t.intro.title(n)}</div>
      </>
    ),
    body: (
      <ListRows
        rows={q.items.map(({ item }) => ({
          title: item.name,
          note: item.lengthM ? t.intro.km(item.lengthM) : t.intro.area,
          color: TONE_COLOR.target,
        }))}
        focus={focus}
        setFocus={setFocus}
      />
    ),
    action: (
      <Button tone="primary" onClick={round.next} autoFocus={keyboard}>
        {t.intro.go} {keyboard && <Kbd>Enter</Kbd>}
      </Button>
    ),
  }
}

/**
 * Score and every question of the round, numbered like their pins on the map (green right, red
 * wrong). A tapped row shows that question as it looked after answering: result and truck route.
 */
function summaryView(ctx: Ctx): View {
  const { round, overview, keyboard, focus, focusFromMap, setFocus } = ctx
  const { questions, results, picks, practice } = round.round
  const asked = questions.flatMap((q, i) => (q.kind === 'intro' ? [] : [{ q, right: results[i]!, pick: picks[i]! }]))
  const misses = asked.filter((a) => !a.right).length
  const score = asked.length - misses
  const tone = (a: (typeof asked)[number]): Tone => (a.right ? 'ok' : 'bad')
  // where a question is pinned: its section, the end where the numbering starts, or the street
  const geometryOf = (q: Asked) =>
    q.kind === 'section'
      ? q.item.sections[q.section]!.geometry
      : q.kind === 'start'
        ? point(q.ends.low)
        : q.item.geometry
  const note = ({ q, pick }: (typeof asked)[number]) => {
    if (q.kind === 'section') return t.question.nr(sectionLabel(q.item.sections[q.section]!))
    if (q.kind === 'start') return t.question.nr(q.ends.from)
    const tapped = round.items.find((i) => i.id === pick)
    return tapped && tapped.id !== q.item.id ? t.question.off(distanceM(q.item, tapped)) : undefined
  }
  const focused = focus === null ? undefined : asked[focus]
  const again = focused && askView(ctx, focused.q, focused.pick, null)
  const scoreText = t.summary.score(score, asked.length)
  // a tap on the map selects the question pinned there, like its row, but the map stays put
  const pickQuestion = (i: number) => setFocus(i === focus ? null : i, true)
  const onPickItem = (id: string) => {
    const i = focused?.q.item.id === id ? focus! : asked.findIndex((a) => a.q.item.id === id)
    if (i >= 0) pickQuestion(i)
  }
  const map: MapView = again?.map ?? {
    highlights: asked.flatMap((a) => (a.q.kind === 'section' ? [] : [{ id: a.q.item.id, tone: tone(a) }])),
    overlays: asked.flatMap((a, i) =>
      a.q.kind === 'section' ? [{ key: i, geometry: geometryOf(a.q), color: TONE_COLOR[tone(a)] }] : [],
    ),
    labels: asked.map((a, i) => ({
      text: String(i + 1),
      color: TONE_COLOR[tone(a)],
      at: geometryOf(a.q),
      pin: true,
    })),
    fit: overview,
    // section overlays are keyed by their question's index
    onPickOverlay: pickQuestion,
  }

  return {
    map: { ...map, ...(again && focusFromMap && { fit: overview }), onPickItem },
    tone: again?.tone,
    prompt: again ? (
      <>
        <button onClick={() => setFocus(null)} className="-my-2 self-start py-2 text-sm font-semibold text-stone-500">
          ‹ {scoreText}
        </button>
        {again.prompt}
      </>
    ) : (
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="text-sm text-stone-500">{practice ? t.summary.practiceDone : t.summary.roundDone}</div>
          <div className="text-2xl font-bold tracking-tight">{scoreText}</div>
          <div className="text-xs text-stone-500">{misses > 0 ? t.summary.missesBack : t.summary.perfect}</div>
        </div>
        {/* the snail cheers for a good round and keeps studying the map otherwise */}
        <img src={score >= asked.length * 0.7 ? snailCheer : snailMap} alt="" className="h-16 w-auto" />
      </div>
    ),
    // on a portrait phone the list scrolls on its own, so the map keeps its room
    body: (
      <div className="flex flex-col gap-1 portrait:max-h-[30dvh] portrait:overflow-y-auto">
        <div className="text-xs font-semibold tracking-wider text-stone-500 uppercase">{t.summary.roundTitle}</div>
        <ListRows
          rows={asked.map((a) => ({ title: a.q.item.name, note: note(a), color: TONE_COLOR[tone(a)] }))}
          focus={focus}
          setFocus={setFocus}
        />
      </div>
    ),
    action: (
      <div className="flex flex-col gap-2">
        {misses > 0 ? (
          <Button tone="primary" onClick={round.practiceMisses} autoFocus={keyboard}>
            {t.summary.fixMisses(misses)} {keyboard && <Kbd>Enter</Kbd>}
          </Button>
        ) : (
          <Button tone="primary" onClick={round.start} autoFocus={keyboard}>
            {t.summary.newRound} {keyboard && <Kbd>Enter</Kbd>}
          </Button>
        )}
        <Button tone="plain" onClick={round.quit}>
          <span className="flex-1 text-center">{t.summary.done}</span> {keyboard && <Kbd>Esc</Kbd>}
        </Button>
      </div>
    ),
  }
}

/** Which route (routes.json) leads to what a question asks. */
function routeKey(q: Asked): string {
  if (q.kind === 'section') return `${q.item.id}:${sectionKey(q.item.sections[q.section]!)}`
  if (q.kind === 'start') return `${q.item.id}:start`
  return q.item.id
}

/** «Nr. 1» and «Nr. 42» at the ends of a shorter street, so you learn where its numbering starts. */
const endLabels = ({ ends }: Item): Label[] =>
  ends
    ? [
        { text: t.question.nr(ends.from), color: NEUTRAL, at: point(ends.low) },
        { text: t.question.nr(ends.to), color: NEUTRAL, at: point(ends.high) },
      ]
    : []

const point = (coordinates: LngLat): Point => ({ type: 'Point', coordinates })

/** Room around a street so it shows in context (0.0025° ≈ 280 m; lng counts 1.5×, its degrees are shorter here). */
function withMargin([w, s, e, n]: BBox, deg = 0.0025): BBox {
  return [w - deg * 1.5, s - deg, e + deg * 1.5, n + deg]
}
