import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import {
  Map as MapLibre,
  Marker,
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapGeoJSONFeature,
  setWorkerUrl,
  type PointLike,
  type StyleSpecification,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useRef, useState } from 'react'
import { t } from './i18n'
import { ROUTE_COLOR, TONE_COLOR, TRUCK_COLOR, type Tone } from './palette'
import { cutLine, segmentDistance, type BBox, type LngLat, type Town } from './town'

/** Extra lines (house-number sections) or points (street ends) drawn on top, pickable by `key`. */
export type Overlay = { key: number; geometry: Geometry; color: string }
/** A badge on the map: a name above a line, or a round numbered `pin` on it. */
export type Label = { text: string; color: string; at: Geometry; pin?: boolean }

export type TownMapProps = {
  town: Town
  /**
   * swisstopo base map (buildings, forest, water) without labels, so the map never gives away a
   * street name. Trimmed to the town by pipeline/basemap.ts (basemap.json), so no style request.
   */
  baseStyle: StyleSpecification
  /** Items to colour, e.g. the asked street in orange; `dashed` marks the user's wrong tap. */
  highlights: { id: string; tone: Tone; dashed?: boolean }[]
  overlays?: Overlay[]
  /** Most important first: a label that would cover an earlier one or hide under the UI is left out. */
  labels?: Label[]
  /** The map fits this box whenever it (or `refitKey`) changes. */
  fit: BBox
  /** Px to keep free for the UI around the map; measured at fit time, so it follows the layout. */
  padding: () => Padding
  refitKey?: string
  /** The truck route from the Magazin: drawn dashed, then a truck dot drives it. */
  route?: LngLat[]
  /** What a tap selects. Taps are ignored when no handler is given. */
  onPickItem?: (id: string) => void
  onPickOverlay?: (key: number) => void
}

// maplibre can't find its worker once bundled; ship it as a plain asset instead.
setWorkerUrl(workerUrl)

/** A tap waits this long before it answers, so a double tap can zoom instead. */
const DOUBLE_TAP_MS = 300
export type Padding = { top: number; bottom: number; left: number; right: number }
const TAP_RADIUS = 18 // px
/** Breathing room the callers add to their padding; labels may use it. */
export const UI_GAP = 16
const NO_OVERLAYS: Overlay[] = []
const NO_LABELS: Label[] = []
const OVERLAY_HIT = ['overlay-hit', 'overlay-points-hit']
/** The truck starts once the map has begun moving, and drives the route in this long. */
const ROUTE_DELAY_MS = 250
const ROUTE_MS = 1200

const collection = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features })

/**
 * Unlabelled MapLibre map of the town with tappable streets and named areas.
 * Purely driven by props; the quiz modes own all state.
 */
export function TownMap({
  town,
  baseStyle,
  highlights,
  overlays = NO_OVERLAYS,
  labels = NO_LABELS,
  fit,
  padding,
  refitKey,
  route,
  onPickItem,
  onPickOverlay,
}: TownMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibre | null>(null)
  const ready = useRef<Promise<void> | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const lastPadding = useRef<Padding>({ top: 0, bottom: 0, left: 0, right: 0 })
  const markers = useRef<Marker[]>([])
  const live = useRef({ onPickItem, onPickOverlay, overlays })
  /** What the mouse is over (`i:<id>` / `o:<key>`), so the hover outline only redraws on change. */
  const hovered = useRef('')
  useEffect(() => {
    live.current = { onPickItem, onPickOverlay, overlays }
    // answered: nothing to pick any more, so drop the hover outline
    if (!onPickItem && !onPickOverlay && map.current) {
      hovered.current = ''
      showHover(map.current, undefined)
    }
  }, [onPickItem, onPickOverlay, overlays])

  // Create the map once.
  useEffect(() => {
    const [w, s, e, n] = town.bbox
    const m = new MapLibre({
      container: container.current!,
      style: baseStyle,
      bounds: [w, s, e, n],
      // the base map has tiles for ±0.02°; the bounds are wider because they hold the whole
      // canvas, and on a phone most of it sits under the question card and the bottom sheet
      maxBounds: [w - 0.05, s - 0.05, e + 0.05, n + 0.05],
      minZoom: 11.5,
      maxZoom: 18,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false, // the app shows «© swisstopo» where the UI leaves room
      // phones report 3× pixels; 2× looks the same here and renders much faster
      pixelRatio: Math.min(window.devicePixelRatio, 2),
      fadeDuration: 0,
    })
    m.touchZoomRotate.disableRotation()
    new Marker({ element: stationElement() }).setLngLat(town.station).addTo(m)
    map.current = m
    if (import.meta.env.DEV) Object.assign(window, { townMap: m }) // for poking at it in devtools
    ready.current = new Promise((resolve) =>
      m.once('load', () => {
        addTownLayers(m, town)
        // mouse only (touch has no hover): outline what a click would pick
        if (matchMedia('(hover: hover)').matches) {
          m.on('mousemove', (ev) => hover(ev.point))
          m.on('mouseout', () => hover(null))
        }
        setStatus('ready')
        resolve()
      }),
    )
    // only matters before the first load; later tile hiccups just retry
    m.on('error', () => setStatus((s) => (s === 'loading' ? 'failed' : s)))
    const byId = new Map(town.items.map((i) => [i.id, i]))
    const hover = (point: { x: number; y: number } | null) => {
      const { onPickItem, onPickOverlay, overlays } = live.current
      let key = ''
      let geometry: Geometry | undefined
      if (point && onPickOverlay) {
        const o = overlays.find((o) => o.key === nearest(m, point, OVERLAY_HIT)?.properties.key)
        if (o) [key, geometry] = [`o:${o.key}`, o.geometry]
      } else if (point && onPickItem) {
        const item = byId.get(nearest(m, point, ['items-hit', 'areas-fill'])?.properties.id)
        if (item) [key, geometry] = [`i:${item.id}`, item.geometry]
      }
      if (key === hovered.current) return
      hovered.current = key
      showHover(m, geometry)
    }
    const pick = (point: { x: number; y: number }) => {
      const { onPickItem, onPickOverlay } = live.current
      if (onPickOverlay) {
        const key = nearest(m, point, OVERLAY_HIT)?.properties.key
        if (typeof key === 'number') onPickOverlay(key)
      } else if (onPickItem) {
        const id = nearest(m, point, ['items-hit', 'areas-fill'])?.properties.id
        if (typeof id === 'string') onPickItem(id)
      }
    }
    let pendingTap: ReturnType<typeof setTimeout> | undefined
    m.on('click', (ev) => {
      clearTimeout(pendingTap)
      // remember the spot on the ground, in case the map moves before the tap counts
      pendingTap = setTimeout(() => pick(m.project(ev.lngLat)), DOUBLE_TAP_MS)
    })
    // On touch, a double tap emits one click and then only zoomstart (no second click, no
    // dblclick), so any start of zooming or panning cancels the pending answer.
    const cancelTap = () => clearTimeout(pendingTap)
    m.on('dblclick', cancelTap)
    m.on('zoomstart', cancelTap)
    m.on('movestart', cancelTap)
    m.on('move', () => declutter(m, markers.current, lastPadding.current))
    return () => {
      clearTimeout(pendingTap)
      m.remove()
    }
  }, [town, baseStyle])

  // Highlights, overlays and labels.
  useEffect(() => {
    let cancelled = false
    void ready.current?.then(() => {
      const m = map.current
      if (!m || cancelled) return
      const byId = new Map(town.items.map((i) => [i.id, i]))
      m.getSource<GeoJSONSource>('highlights')?.setData(
        collection(
          highlights.flatMap(({ id, tone, dashed }) => {
            const item = byId.get(id)
            return item
              ? [
                  {
                    type: 'Feature',
                    geometry: item.geometry,
                    properties: { color: TONE_COLOR[tone], dashed: !!dashed },
                  },
                ]
              : []
          }),
        ),
      )
      m.getSource<GeoJSONSource>('overlays')?.setData(
        collection(
          overlays.map((o) => ({ type: 'Feature', geometry: o.geometry, properties: { key: o.key, color: o.color } })),
        ),
      )
      markers.current.forEach((mk) => mk.remove())
      markers.current = labels.map((l) =>
        new Marker({ element: badge(l), anchor: l.pin ? 'center' : 'bottom', offset: l.pin ? [0, 0] : [0, -8] })
          .setLngLat(labelPoint(l.at))
          .addTo(m),
      )
      declutter(m, markers.current, lastPadding.current)
    })
    return () => {
      cancelled = true
    }
  }, [town, highlights, overlays, labels])

  // The route: dashed in full, then the truck drives it and draws it solid behind itself.
  useEffect(() => {
    let frame = 0
    let cancelled = false
    void ready.current?.then(() => {
      const m = map.current
      if (!m || cancelled) return
      const set = (id: string, features: Feature[]) => m.getSource<GeoJSONSource>(id)?.setData(collection(features))
      const line = (coords: LngLat[]): Feature => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      })
      set('route-full', route ? [line(route)] : [])
      if (!route) {
        set('route', [])
        set('truck', [])
        return
      }
      const start = performance.now() + ROUTE_DELAY_MS
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches
      const draw = (now: number) => {
        const f = still ? 1 : Math.min(1, Math.max(0, (now - start) / ROUTE_MS))
        const done = cutLine(route, f)
        set('route', done.length > 1 ? [line(done)] : [])
        set('truck', [{ type: 'Feature', geometry: { type: 'Point', coordinates: done.at(-1)! }, properties: {} }])
        if (f < 1) frame = requestAnimationFrame(draw)
      }
      frame = requestAnimationFrame(draw)
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [route])

  // Fit the requested box.
  const [w, s, e, n] = fit
  useEffect(() => {
    const m = map.current
    if (!m) return
    lastPadding.current = padding()
    m.fitBounds([w, s, e, n], { padding: lastPadding.current, maxZoom: 16.5, duration: 600 })
    // padding is a fresh function each render; only refit when the box or refitKey changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refitKey, w, s, e, n])

  // maplibre sets `position: relative` on the container, so it sits inside an absolute wrapper
  return (
    <div className="absolute inset-0">
      <div ref={container} className="size-full" />
      {status !== 'ready' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center" role="status">
          <span className="rounded-full bg-white/90 px-4 py-2 text-sm text-stone-700 shadow">
            {status === 'loading' ? t.map.loading : t.map.failed}
          </span>
        </div>
      )}
    </div>
  )
}

function addTownLayers(m: MapLibre, town: Town) {
  const features = (kind: 'street' | 'area') =>
    collection(
      town.items
        .filter((i) => i.kind === kind)
        .map((i) => ({ type: 'Feature', geometry: i.geometry, properties: { id: i.id } })),
    )
  m.addSource('streets', { type: 'geojson', data: features('street') })
  m.addSource('areas', { type: 'geojson', data: features('area') })
  m.addSource('highlights', { type: 'geojson', data: collection([]) })
  m.addSource('overlays', { type: 'geojson', data: collection([]) })
  m.addSource('hover', { type: 'geojson', data: collection([]) })
  for (const id of ['route-full', 'route', 'truck']) m.addSource(id, { type: 'geojson', data: collection([]) })

  const width = (min: number, max: number): ExpressionSpecification => [
    'interpolate',
    ['linear'],
    ['zoom'],
    13,
    min,
    17,
    max,
  ]
  m.addLayer({
    id: 'areas-fill',
    type: 'fill',
    source: 'areas',
    paint: { 'fill-color': '#78716c', 'fill-opacity': 0.08 },
  })
  m.addLayer({
    id: 'areas-line',
    type: 'line',
    source: 'areas',
    paint: { 'line-color': '#78716c', 'line-width': 1.2, 'line-dasharray': [3, 2] },
  })
  m.addLayer({
    id: 'streets-line',
    type: 'line',
    source: 'streets',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#78716c', 'line-width': width(1.2, 4), 'line-opacity': 0.55 },
  })
  // a soft blue halo under the hovered street, area or section (selected lines draw on top)
  m.addLayer({
    id: 'hover-fill',
    type: 'fill',
    source: 'hover',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': TONE_COLOR.select, 'fill-opacity': 0.12 },
  })
  m.addLayer({
    id: 'hover-line',
    type: 'line',
    source: 'hover',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': TONE_COLOR.select, 'line-width': width(11, 22), 'line-opacity': 0.4 },
  })
  m.addLayer({
    id: 'hover-point',
    type: 'circle',
    source: 'hover',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-color': TONE_COLOR.select, 'circle-radius': 20, 'circle-opacity': 0.3 },
  })
  m.addLayer({
    id: 'items-hit',
    type: 'line',
    source: 'streets',
    paint: { 'line-color': '#000', 'line-width': 28, 'line-opacity': 0.01 },
  })
  m.addLayer({
    id: 'highlights-fill',
    type: 'fill',
    source: 'highlights',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.35 },
  })
  m.addLayer({
    id: 'highlights-line',
    type: 'line',
    source: 'highlights',
    filter: ['!', ['get', 'dashed']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': width(4, 9) },
  })
  m.addLayer({
    id: 'highlights-dashed',
    type: 'line',
    source: 'highlights',
    filter: ['get', 'dashed'],
    paint: { 'line-color': ['get', 'color'], 'line-width': width(4, 9), 'line-dasharray': [1.2, 0.8] },
  })
  const round = { 'line-cap': 'round', 'line-join': 'round' } as const
  m.addLayer({
    id: 'route-full',
    type: 'line',
    source: 'route-full',
    layout: round,
    paint: { 'line-color': ROUTE_COLOR, 'line-width': width(3, 6), 'line-opacity': 0.4, 'line-dasharray': [1, 1.5] },
  })
  m.addLayer({
    id: 'route-casing',
    type: 'line',
    source: 'route',
    layout: round,
    paint: { 'line-color': '#fff', 'line-width': width(6, 11) },
  })
  m.addLayer({
    id: 'route',
    type: 'line',
    source: 'route',
    layout: round,
    paint: { 'line-color': ROUTE_COLOR, 'line-width': width(3, 6) },
  })
  m.addLayer({
    id: 'overlays-line',
    type: 'line',
    source: 'overlays',
    filter: ['!=', ['geometry-type'], 'Point'],
    layout: round,
    paint: { 'line-color': ['get', 'color'], 'line-width': width(5, 11) },
  })
  // street ends to tap: white discs ringed in the overlay colour
  m.addLayer({
    id: 'overlay-points',
    type: 'circle',
    source: 'overlays',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 11,
      'circle-color': '#fff',
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': 4,
    },
  })
  m.addLayer({
    id: 'overlay-hit',
    type: 'line',
    source: 'overlays',
    filter: ['!=', ['geometry-type'], 'Point'],
    paint: { 'line-color': '#000', 'line-width': 34, 'line-opacity': 0.01 },
  })
  m.addLayer({
    id: 'overlay-points-hit',
    type: 'circle',
    source: 'overlays',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 26, 'circle-color': '#000', 'circle-opacity': 0.01 },
  })
  m.addLayer({
    id: 'truck',
    type: 'circle',
    source: 'truck',
    paint: { 'circle-radius': 8, 'circle-color': TRUCK_COLOR, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 },
  })
}

/**
 * The feature closest to a tap, measured in screen pixels. A tap inside a named area
 * counts as 0.6 × TAP_RADIUS away, so a street running through the area wins when hit squarely.
 */
function nearest(m: MapLibre, p: { x: number; y: number }, layers: string[]): MapGeoJSONFeature | undefined {
  const box: [PointLike, PointLike] = [
    [p.x - TAP_RADIUS, p.y - TAP_RADIUS],
    [p.x + TAP_RADIUS, p.y + TAP_RADIUS],
  ]
  let best: MapGeoJSONFeature | undefined
  let bestDist = Infinity
  for (const f of m.queryRenderedFeatures(box, { layers })) {
    const d = f.layer.type === 'fill' ? TAP_RADIUS * 0.6 : geometryDistance(m, p, f.geometry)
    if (d < bestDist) [best, bestDist] = [f, d]
  }
  return best
}

/** Screen distance from `p` to a line or point. */
function geometryDistance(m: MapLibre, p: { x: number; y: number }, g: Geometry): number {
  if (g.type === 'Point') {
    const q = m.project([g.coordinates[0]!, g.coordinates[1]!])
    return Math.hypot(q.x - p.x, q.y - p.y)
  }
  const lines: Position[][] =
    g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []
  let best = Infinity
  for (const line of lines) {
    const pts = line.map(([lng, lat]) => m.project([lng!, lat!]))
    for (let i = 1; i < pts.length; i++) best = Math.min(best, segmentDistance(p, pts[i - 1]!, pts[i]!))
  }
  return best
}

/** Where a label goes: on a point, the middle vertex of the longest line, or the middle of an area's outline. */
function labelPoint(g: Geometry): [number, number] {
  if (g.type === 'Point') return [g.coordinates[0]!, g.coordinates[1]!]
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
    const ring = g.type === 'Polygon' ? g.coordinates[0]! : g.coordinates[0]![0]!
    const avg = (i: 0 | 1) => ring.reduce((sum, p) => sum + p[i]!, 0) / ring.length
    return [avg(0), avg(1)]
  }
  const lines: Position[][] =
    g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), [])
  const [lng, lat] = longest[Math.floor(longest.length / 2)] ?? [0, 0]
  return [lng!, lat!]
}

/** Draws the hover halo around `geometry` (none: clears it) with a pointer cursor to match. */
function showHover(m: MapLibre, geometry: Geometry | undefined) {
  m.getCanvas().style.cursor = geometry ? 'pointer' : ''
  m.getSource<GeoJSONSource>('hover')?.setData(
    collection(geometry ? [{ type: 'Feature', geometry, properties: {} }] : []),
  )
}

/**
 * Shows labels in priority order and hides each one that would cover an earlier label or sit
 * under the UI around the map (the fit padding, minus its breathing room).
 */
function declutter(m: MapLibre, markers: Marker[], pad: Padding) {
  const box = m.getContainer().getBoundingClientRect()
  const [top, bottom] = [box.top + pad.top - UI_GAP, box.bottom - pad.bottom + UI_GAP]
  const shown: DOMRect[] = []
  for (const mk of markers) {
    const el = mk.getElement()
    el.style.visibility = 'visible'
    const r = el.getBoundingClientRect()
    const overlaps = shown.some(
      (o) => r.left < o.right + 2 && o.left < r.right + 2 && r.top < o.bottom + 2 && o.top < r.bottom + 2,
    )
    if (overlaps || r.top < top || r.bottom > bottom) el.style.visibility = 'hidden'
    else shown.push(r)
  }
}

/** The Feuerwehrmagazin: a red dot with a white flame, as the one fixed point of reference. */
function stationElement(): HTMLElement {
  const el = document.createElement('div')
  el.title = t.map.station
  el.className =
    'pointer-events-none grid size-7 place-items-center rounded-full bg-red-600 shadow-md ring-2 ring-white'
  el.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="white" aria-hidden="true"><path d="M12 2c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 1.5.8 2.5 2 3 0-3-1-5.5 1-8.5z"/></svg>'
  return el
}

function badge({ text, color, pin }: Label): HTMLElement {
  const el = document.createElement('div')
  el.className = pin
    ? 'pointer-events-none grid size-6 place-items-center rounded-full text-xs font-extrabold text-white shadow ring-2 ring-white'
    : 'pointer-events-none rounded-md px-1.5 py-0.5 text-xs font-bold whitespace-nowrap text-white shadow'
  el.style.background = color
  el.textContent = text
  return el
}
