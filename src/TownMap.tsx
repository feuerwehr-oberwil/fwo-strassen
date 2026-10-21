import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import {
  Map as MapLibre,
  Marker,
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapGeoJSONFeature,
  setWorkerUrl,
  type PointLike,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useRef } from 'react'
import basemap from './data/basemap.json'
import { TONE_COLOR, type Tone } from './palette'
import type { BBox, Town } from './town'

/** Extra lines drawn on top (house-number sections), pickable by `key`. */
export type Overlay = { key: number; geometry: Geometry; color: string; label?: string }

export type TownMapProps = {
  town: Town
  /** Items to colour, e.g. the asked street in orange. */
  highlights: { id: string; tone: Tone }[]
  overlays?: Overlay[]
  /** The map fits this box whenever it (or `refitKey`) changes, keeping `padding` px free for UI. */
  fit: BBox
  padding: Padding
  refitKey?: string
  /** What a tap selects. Taps are ignored when no handler is given. */
  onPickItem?: (id: string) => void
  onPickOverlay?: (key: number) => void
}

// maplibre can't find its worker once bundled; ship it as a plain asset instead.
setWorkerUrl(workerUrl)

// swisstopo base map (buildings, forest, water) without labels, so the map never gives away a
// street name. Trimmed to Oberwil by data/basemap.py and bundled, so no style request.
const BASE_STYLE = basemap
/** A tap waits this long for a second tap: a double tap zooms in and must not answer. */
const DOUBLE_TAP_MS = 250
export type Padding = { top: number; bottom: number; left: number; right: number }
const TAP_RADIUS = 18 // px
const NO_OVERLAYS: Overlay[] = []

const collection = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features })

/**
 * Unlabelled MapLibre map of Oberwil with tappable streets and named areas.
 * Purely driven by props; the quiz modes own all state.
 */
export function TownMap({
  town,
  highlights,
  overlays = NO_OVERLAYS,
  fit,
  padding,
  refitKey,
  onPickItem,
  onPickOverlay,
}: TownMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibre | null>(null)
  const ready = useRef<Promise<void> | null>(null)
  const handlers = useRef({ onPickItem, onPickOverlay })
  useEffect(() => {
    handlers.current = { onPickItem, onPickOverlay }
  }, [onPickItem, onPickOverlay])

  // Create the map once.
  useEffect(() => {
    const [w, s, e, n] = town.bbox
    const m = new MapLibre({
      container: container.current!,
      style: BASE_STYLE,
      bounds: [w, s, e, n],
      maxBounds: [w - 0.02, s - 0.02, e + 0.02, n + 0.02], // same area the base map has tiles for
      minZoom: 12,
      maxZoom: 18,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
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
        resolve()
      }),
    )
    const pick = (point: { x: number; y: number }) => {
      const { onPickItem, onPickOverlay } = handlers.current
      if (onPickOverlay) {
        const key = nearest(m, point, ['overlay-hit'])?.properties.key
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
    m.on('dblclick', () => clearTimeout(pendingTap))
    return () => {
      clearTimeout(pendingTap)
      m.remove()
    }
  }, [town])

  // Highlights and overlays.
  const labels = useRef<Marker[]>([])
  useEffect(() => {
    let cancelled = false
    void ready.current?.then(() => {
      const m = map.current
      if (!m || cancelled) return
      const byId = new Map(town.items.map((i) => [i.id, i]))
      m.getSource<GeoJSONSource>('highlights')?.setData(
        collection(
          highlights.flatMap(({ id, tone }) => {
            const item = byId.get(id)
            return item ? [{ type: 'Feature', geometry: item.geometry, properties: { color: TONE_COLOR[tone] } }] : []
          }),
        ),
      )
      m.getSource<GeoJSONSource>('overlays')?.setData(
        collection(
          overlays.map((o) => ({ type: 'Feature', geometry: o.geometry, properties: { key: o.key, color: o.color } })),
        ),
      )
      labels.current.forEach((mk) => mk.remove())
      labels.current = overlays.flatMap((o) =>
        o.label ? [new Marker({ element: badge(o.label, o.color) }).setLngLat(midpoint(o.geometry)).addTo(m)] : [],
      )
    })
    return () => {
      cancelled = true
    }
  }, [town, highlights, overlays])

  // Fit the requested box.
  const [w, s, e, n] = fit
  useEffect(() => {
    map.current?.fitBounds([w, s, e, n], { padding, maxZoom: 16.5, duration: 600 })
    // padding is a fresh object each render; only refit when the box or refitKey changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refitKey, w, s, e, n])

  // maplibre sets `position: relative` on the container, so it sits inside an absolute wrapper
  return (
    <div className="absolute inset-0">
      <div ref={container} className="size-full" />
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
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': width(4, 9) },
  })
  m.addLayer({
    id: 'overlays-line',
    type: 'line',
    source: 'overlays',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': width(5, 11) },
  })
  m.addLayer({
    id: 'overlay-hit',
    type: 'line',
    source: 'overlays',
    paint: { 'line-color': '#000', 'line-width': 34, 'line-opacity': 0.01 },
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
    const d = f.layer.type === 'fill' ? TAP_RADIUS * 0.6 : lineDistance(m, p, f.geometry)
    if (d < bestDist) [best, bestDist] = [f, d]
  }
  return best
}

function lineDistance(m: MapLibre, p: { x: number; y: number }, g: Geometry): number {
  const lines: Position[][] =
    g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []
  let best = Infinity
  for (const line of lines) {
    const pts = line.map(([lng, lat]) => m.project([lng!, lat!]))
    for (let i = 1; i < pts.length; i++) best = Math.min(best, segmentDistance(p, pts[i - 1]!, pts[i]!))
  }
  return best
}

type XY = { x: number; y: number }
function segmentDistance(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const t = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Middle vertex of the longest line – where a section's label goes. */
function midpoint(g: Geometry): [number, number] {
  const lines: Position[][] =
    g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), [])
  const [lng, lat] = longest[Math.floor(longest.length / 2)] ?? [0, 0]
  return [lng!, lat!]
}

/** The Feuerwehrmagazin: a red dot with a white flame, as the one fixed point of reference. */
function stationElement(): HTMLElement {
  const el = document.createElement('div')
  el.title = 'Feuerwehrmagazin'
  el.className =
    'pointer-events-none grid size-7 place-items-center rounded-full bg-red-600 shadow-md ring-2 ring-white'
  el.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="white" aria-hidden="true"><path d="M12 2c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 1.5.8 2.5 2 3 0-3-1-5.5 1-8.5z"/></svg>'
  return el
}

function badge(text: string, color: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'rounded-md px-1.5 py-0.5 text-xs font-bold text-white shadow pointer-events-none'
  el.style.background = color
  el.textContent = text
  return el
}
