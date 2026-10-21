import type { ReactNode } from 'react'
import snailCheer from './assets/snail-cheer.webp'
import snailMap from './assets/snail-map.webp'
import { NEUTRAL, SECTION_COLORS, TONE_COLOR, type Tone } from './palette'
import type { Question } from './round'
import { sectionLabel, union, type BBox, type Item } from './town'
import type { TownMapProps } from './TownMap'
import { Button, Kbd } from './ui'
import type { RoundApi } from './useRound'

export type MapView = Omit<TownMapProps, 'town' | 'padding' | 'refitKey'>
/** What one screen of the quiz shows: map state, the question and everything below it. */
export type View = { map: MapView; prompt: ReactNode; body: ReactNode }

type Ctx = { round: RoundApi; overview: BBox; desktop: boolean }

/** The screen for the current step (intro or question), or the summary once the round is done. */
export function questionView({ round, overview, desktop }: Ctx): View {
  const q = round.question
  if (!q) return summaryView(round, overview)
  if (q.kind === 'intro') return introView(round, q, desktop)
  const { pick, selection } = round.round
  const isLast = round.round.index === round.round.questions.length - 1
  const next = pick !== null && (
    <Button tone="primary" onClick={round.next} autoFocus>
      {isLast ? 'Auswertung' : 'Weiter'} {desktop && <Kbd>Enter</Kbd>}
    </Button>
  )
  // map questions: a tap only selects, «Prüfen» answers
  const confirm = pick === null && (
    <>
      <div className="text-sm text-stone-600">
        {selection === null
          ? desktop
            ? 'Klicke auf die Karte. Mausrad zoomt, ziehen verschiebt.'
            : 'Tippe auf die Karte. Doppeltippen oder zwei Finger zoomen.'
          : 'Ausgewählt (blau). Prüfen – oder eine andere wählen.'}
      </div>
      {selection !== null && (
        <Button tone="primary" onClick={round.confirm} autoFocus>
          Prüfen {desktop && <Kbd>Enter</Kbd>}
        </Button>
      )}
    </>
  )

  if (q.kind === 'section') {
    const s = q.item.sections[q.section]!
    return {
      map: {
        highlights: [],
        overlays: q.item.sections.map((sec, i) =>
          pick === null
            ? { key: i, geometry: sec.geometry, color: i === selection ? TONE_COLOR.select : NEUTRAL }
            : {
                key: i,
                geometry: sec.geometry,
                color: SECTION_COLORS[i]!,
                label: `${i === q.section ? '✓ ' : ''}${sectionLabel(sec)}`,
              },
        ),
        fit: q.item.bbox,
        onPickOverlay: pick === null ? round.select : undefined,
      },
      prompt: (
        <>
          <div className="text-sm text-stone-500">{q.item.name}</div>
          <div className="text-2xl font-bold tracking-tight">Wo liegt Nr. {sectionLabel(s)}?</div>
        </>
      ),
      body: (
        <>
          {confirm}
          {pick !== null && (
            <div role="status">
              {pick === q.section ? (
                <>
                  ✓ <b>Richtig</b> – Nr. {sectionLabel(s)}
                </>
              ) : (
                <>
                  ✗ <b>Falsch:</b> das war Nr. {sectionLabel(q.item.sections[Number(pick)]!)}. Gesucht war Nr.{' '}
                  <b>{sectionLabel(s)}</b> (✓ auf der Karte).
                </>
              )}
              <div className="text-sm text-stone-600">Die Farben zeigen alle Abschnitte.</div>
            </div>
          )}
          {next}
        </>
      ),
    }
  }

  const target = q.item
  const picked = typeof pick === 'string' ? round.items.find((i) => i.id === pick) : undefined
  const highlights: { id: string; tone: Tone }[] = []
  if (picked && picked.id !== target.id) highlights.push({ id: picked.id, tone: 'bad' })
  if (picked) highlights.push({ id: target.id, tone: 'ok' })
  else if (q.kind === 'name') highlights.push({ id: target.id, tone: 'target' })
  else if (typeof selection === 'string') highlights.push({ id: selection, tone: 'select' })
  const fit = picked ? union(target.bbox, picked.bbox) : q.kind === 'find' ? overview : withMargin(target.bbox, 0.004)

  if (q.kind === 'find') {
    return {
      map: { highlights, fit, onPickItem: pick === null ? round.select : undefined },
      prompt: (
        <>
          <div className="text-sm text-stone-500">
            Tippe auf {target.kind === 'area' ? 'das Gebiet' : 'die Strasse'}
          </div>
          <div className="text-2xl font-bold tracking-tight">{target.name}</div>
        </>
      ),
      body: (
        <>
          {confirm}
          {picked && feedback(target, picked)}
          {next}
        </>
      ),
    }
  }

  return {
    map: { highlights, fit },
    prompt: (
      <div className="text-2xl font-bold tracking-tight">
        Wie heisst {target.kind === 'area' ? 'das orange Gebiet' : 'die orange Strasse'}?
      </div>
    ),
    body: (
      <>
        {q.options.map((o, i) => (
          <Button
            key={o.id}
            onClick={() => round.answer(o.id)}
            disabled={picked !== undefined}
            tone={!picked ? 'plain' : o.id === target.id ? 'ok' : o.id === picked.id ? 'bad' : 'plain'}
          >
            {desktop && <Kbd>{i + 1}</Kbd>}
            {o.name}
            {picked && o.id === target.id && <span className="ml-auto">✓</span>}
            {picked && o.id === picked.id && o.id !== target.id && <span className="ml-auto">✗</span>}
          </Button>
        ))}
        {picked && (
          <div role="status">
            {picked.id === target.id ? (
              <>
                ✓ <b>Richtig</b>
              </>
            ) : (
              <>
                ✗ <b>Falsch</b> – richtig ist <b>{target.name}</b>.
              </>
            )}
          </div>
        )}
        {next}
      </>
    ),
  }
}

/** A new street, shown before it is asked. Can be skipped one by one or switched off. */
function introView(round: RoundApi, q: Extract<Question, { kind: 'intro' }>, desktop: boolean): View {
  const item = q.item
  const sections = q.withSections ? item.sections : []
  return {
    map: {
      highlights: [{ id: item.id, tone: 'target' }],
      overlays: sections.map((s, i) => ({
        key: i,
        geometry: s.geometry,
        color: SECTION_COLORS[i]!,
        label: sectionLabel(s),
      })),
      fit: withMargin(item.bbox, 0.004),
    },
    prompt: (
      <>
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-800">NEU</span>
          {item.kind === 'area' ? 'Merk dir dieses Gebiet' : 'Merk dir diese Strasse'}
        </div>
        <div className="text-2xl font-bold tracking-tight">{item.name}</div>
      </>
    ),
    body: (
      <>
        {sections.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {sections.map((s, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: SECTION_COLORS[i] }} />
                Nr. {sectionLabel(s)}
              </span>
            ))}
          </div>
        )}
        <div className="text-sm text-stone-600">Wird später in dieser Runde abgefragt.</div>
        <Button tone="primary" onClick={round.next} autoFocus>
          Weiter {desktop && <Kbd>Enter</Kbd>}
        </Button>
        <Button onClick={round.skipIntro}>Kenne ich schon – frag mich</Button>
        <button
          className="min-h-11 text-sm text-stone-600 underline"
          onClick={() => {
            round.configure({ intro: false })
            round.skipIntro()
          }}
        >
          Neue Strassen nicht mehr vorstellen
        </button>
      </>
    ),
  }
}

function feedback(target: Item, picked: Item) {
  if (picked.id === target.id)
    return (
      <div role="status">
        ✓ <b>Richtig</b> – {target.name}
      </div>
    )
  return (
    <div role="status">
      ✗ <b>Falsch:</b> das war <b className="text-red-700">{picked.name}</b>.<br />
      <b className="text-green-800">{target.name}</b> ist grün markiert.
    </div>
  )
}

function summaryView(round: RoundApi, overview: BBox): View {
  const { questions, results } = round.round
  const asked = questions.filter((q) => q.kind !== 'intro')
  const wrong = questions.filter((_, i) => results[i] === false)
  const score = results.filter((r) => r === true).length
  const label = (q: Question) =>
    q.kind === 'section' ? `${q.item.name} ${sectionLabel(q.item.sections[q.section]!)}` : q.item.name
  return {
    map: {
      highlights: wrong.filter((q) => q.kind !== 'section').map((q) => ({ id: q.item.id, tone: 'bad' as const })),
      fit: overview,
    },
    prompt: (
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="text-sm text-stone-500">Runde fertig</div>
          <div className="text-2xl font-bold tracking-tight">
            {score} / {asked.length} richtig
          </div>
        </div>
        {/* the snail cheers for a good round and keeps studying the map otherwise */}
        <img src={score >= asked.length * 0.7 ? snailCheer : snailMap} alt="" className="h-20 w-auto" />
      </div>
    ),
    body: (
      <>
        {wrong.length > 0 ? (
          <div className="flex flex-col gap-1">
            <div className="text-xs font-semibold tracking-wider text-stone-600 uppercase">Kommt bald wieder</div>
            {wrong.map((q) => (
              <div key={q.key} className="text-red-700">
                ✗ {label(q)}
              </div>
            ))}
          </div>
        ) : (
          <div>Alles richtig – stark!</div>
        )}
        <Button tone="primary" onClick={round.restart} autoFocus>
          Neue Runde
        </Button>
      </>
    ),
  }
}

function withMargin([w, s, e, n]: BBox, deg: number): BBox {
  return [w - deg * 1.5, s - deg, e + deg * 1.5, n + deg]
}
