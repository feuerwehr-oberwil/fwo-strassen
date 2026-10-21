import type { ReactNode } from 'react'
import snailCheer from './assets/snail-cheer.webp'
import snailMap from './assets/snail-map.webp'
import { NEUTRAL, SECTION_COLORS, type Tone } from './palette'
import type { Question } from './round'
import { sectionLabel, union, type BBox, type Item } from './town'
import type { TownMapProps } from './TownMap'
import { Button, Kbd } from './ui'
import type { RoundApi } from './useRound'

export type MapView = Omit<TownMapProps, 'town' | 'padding' | 'refitKey'>
/** What one screen of the quiz shows: map state, the question and everything below it. */
export type View = { map: MapView; prompt: ReactNode; body: ReactNode }

type Ctx = { round: RoundApi; overview: BBox; desktop: boolean }

/** The screen for the current question, or the summary once the round is done. */
export function questionView({ round, overview, desktop }: Ctx): View {
  const q = round.question
  if (!q) return summaryView(round, overview)
  const pick = round.round.pick
  const answer = round.answer
  const isLast = round.round.index === round.round.questions.length - 1
  const next = pick !== null && (
    <Button tone="primary" onClick={round.next}>
      {isLast ? 'Auswertung' : 'Weiter'} {desktop && <Kbd>Enter</Kbd>}
    </Button>
  )

  if (q.kind === 'section') {
    const s = q.item.sections[q.section]!
    return {
      map: {
        highlights: [],
        overlays: q.item.sections.map((sec, i) =>
          pick === null
            ? { key: i, geometry: sec.geometry, color: NEUTRAL }
            : { key: i, geometry: sec.geometry, color: SECTION_COLORS[i]!, label: sectionLabel(sec) },
        ),
        fit: q.item.bbox,
        onPickOverlay: pick === null ? answer : undefined,
      },
      prompt: (
        <>
          <div className="text-sm text-stone-500">{q.item.name}</div>
          <div className="text-2xl font-bold tracking-tight">Wo liegt Nr. {sectionLabel(s)}?</div>
        </>
      ),
      body: (
        <>
          {pick === null ? (
            <div className="text-sm text-stone-500">Tippe den Abschnitt auf der Karte.</div>
          ) : (
            <div>
              {pick === q.section ? (
                <>
                  ✓ <b>Richtig</b>
                </>
              ) : (
                <>
                  ✗ Das war Nr. <b className="text-red-600">{sectionLabel(q.item.sections[Number(pick)]!)}</b>.
                </>
              )}
              <div className="text-sm text-stone-500">Die Farben zeigen alle Abschnitte.</div>
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
  const fit = picked ? union(target.bbox, picked.bbox) : q.kind === 'find' ? overview : withMargin(target.bbox, 0.004)

  if (q.kind === 'find') {
    return {
      map: { highlights, fit, onPickItem: pick === null ? answer : undefined },
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
          {picked ? (
            feedback(target, picked)
          ) : (
            <div className="text-sm text-stone-500">
              {desktop ? 'Mausrad zoomt, ziehen verschiebt.' : 'Doppeltippen oder zwei Finger zum Zoomen.'}
            </div>
          )}
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
            onClick={() => answer(o.id)}
            tone={!picked ? 'plain' : o.id === target.id ? 'ok' : o.id === picked.id ? 'bad' : 'plain'}
          >
            {desktop && <Kbd>{i + 1}</Kbd>}
            {o.name}
          </Button>
        ))}
        {next}
      </>
    ),
  }
}

function feedback(target: Item, picked: Item) {
  if (picked.id === target.id)
    return (
      <div>
        ✓ <b>Richtig</b> – {target.name}
      </div>
    )
  return (
    <div>
      ✗ Das war <b className="text-red-600">{picked.name}</b>.<br />
      <b className="text-green-700">{target.name}</b> ist grün.
    </div>
  )
}

function summaryView(round: RoundApi, overview: BBox): View {
  const { questions, results } = round.round
  const wrong = questions.filter((_, i) => !results[i])
  const score = results.filter(Boolean).length
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
            {score} / {questions.length} richtig
          </div>
        </div>
        {/* the snail cheers for a good round and keeps studying the map otherwise */}
        <img src={score >= 7 ? snailCheer : snailMap} alt="" className="h-20 w-auto" />
      </div>
    ),
    body: (
      <>
        {wrong.length > 0 ? (
          <div className="flex flex-col gap-1">
            <div className="text-xs font-semibold tracking-wider text-stone-400 uppercase">Kommt bald wieder</div>
            {wrong.map((q) => (
              <div key={q.key} className="text-red-700">
                ✗ {label(q)}
              </div>
            ))}
          </div>
        ) : (
          <div>Alles richtig – stark!</div>
        )}
        <Button tone="primary" onClick={round.restart}>
          Neue Runde
        </Button>
      </>
    ),
  }
}

function withMargin([w, s, e, n]: BBox, deg: number): BBox {
  return [w - deg * 1.5, s - deg, e + deg * 1.5, n + deg]
}
