import type { ReactNode } from 'react'
import snailCheer from './assets/snail-cheer.webp'
import snailMap from './assets/snail-map.webp'
import { NEUTRAL, SECTION_COLORS, TONE_COLOR, type Tone } from './palette'
import type { Question } from './round'
import { sectionLabel, union, type BBox } from './town'
import { ListRows, Result, Verdict } from './RoundParts'
import type { Label, TownMapProps } from './TownMap'
import { Button, Kbd } from './ui'
import type { Round, RoundApi } from './useRound'

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
  const isLast = round.round.index === round.round.questions.length - 1
  const action =
    pick !== null ? (
      <Button tone="primary" onClick={round.next} autoFocus={desktop}>
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
        fit: q.item.bbox,
        onPickOverlay: pick === null ? round.select : undefined,
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

  const target = q.item
  const picked = typeof pick === 'string' ? round.items.find((i) => i.id === pick) : undefined
  const wrong = picked && picked.id !== target.id ? picked : undefined
  const highlights: MapView['highlights'] = []
  if (wrong) highlights.push({ id: wrong.id, tone: 'bad', dashed: true })
  if (picked) highlights.push({ id: target.id, tone: 'ok' })
  else if (q.kind === 'name') highlights.push({ id: target.id, tone: 'target' })
  else if (typeof selection === 'string') highlights.push({ id: selection, tone: 'select' })
  const tone = picked ? (wrong ? 'bad' : 'ok') : undefined
  const fit = wrong
    ? withMargin(union(target.bbox, wrong.bbox))
    : q.kind === 'name' || picked
      ? withMargin(target.bbox)
      : ctx.overview
  const what = target.kind === 'area' ? 'das Gebiet' : 'die Strasse'

  if (q.kind === 'find')
    return {
      map: { highlights, fit, onPickItem: pick === null ? round.select : undefined },
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
    map: { highlights, fit },
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
  const sections = focused?.withSections ? focused.item.sections : []
  const labels: Label[] = q.items.flatMap(({ item }, i) =>
    i === focus ? [] : [{ text: String(i + 1), color: TONE_COLOR.target, at: item.geometry, pin: true }],
  )
  if (focused) {
    labels.unshift(
      { text: focused.item.name, color: TONE_COLOR.target, at: focused.item.geometry },
      ...sections.map((s, i) => ({ text: sectionLabel(s), color: SECTION_COLORS[i]!, at: s.geometry })),
    )
  }
  const n = q.items.length
  return {
    map: {
      highlights: q.items.map(({ item }) => ({ id: item.id, tone: 'target' })),
      overlays: sections.map((s, i) => ({ key: i, geometry: s.geometry, color: SECTION_COLORS[i]! })),
      labels,
      fit: withMargin(focused ? focused.item.bbox : q.items.map((i) => i.item.bbox).reduce(union)),
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
  const geometryOf = (q: (typeof misses)[number]) =>
    q.kind === 'section' ? q.item.sections[q.section]!.geometry : q.item.geometry
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
          <div className="text-sm text-stone-500">{practice ? 'Fehler geübt' : 'Runde fertig'}</div>
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
              note: q.kind === 'section' ? `Nr. ${sectionLabel(q.item.sections[q.section]!)}` : undefined,
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
            Fehler nochmal üben ({misses.length}) {desktop && <Kbd>Enter</Kbd>}
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
  q.kind === 'section' ? `${q.item.name} ${sectionLabel(q.item.sections[q.section]!)}` : q.item.name

const km = (m: number) => `${(m / 1000).toFixed(1).replace('.', ',')} km`

function withMargin([w, s, e, n]: BBox, deg = 0.004): BBox {
  return [w - deg * 1.5, s - deg, e + deg * 1.5, n + deg]
}
