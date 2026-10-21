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
import { TONE_COLOR, type Tone } from './palette'
import type { BBox, Town } from './town'

/** Extra lines drawn on top (house-number sections), pickable by `key`. */
export type Overlay = { key: number; geometry: Geometry; color: string; label?: string }

export type TownMapProps = {
  town: Town
  /** Items to colour, e.g. the asked street in orange. */
  highlights: { id: string; tone: Tone }[]
  overlays?: Overlay[]
  /** The map fits this box whenever it (or `refitKey`) changes. */
  fit: BBox
  refitKey?: string
  /** What a tap selects. Taps are ignored when no handler is given. */
  onPickItem?: (id: string) => void
  onPickOverlay?: (key: number) => void
}

// maplibre can't find its worker once bundled; ship it as a plain asset instead.
setWorkerUrl(workerUrl)

// swisstopo base map (buildings, forest, water) with every label layer removed, so the
// map never gives away a street name.
const BASE_STYLE = 'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json'
const PADDING = { top: 150, bottom: 30, left: 24, right: 24 }
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
      bounds: [w, s, e, n],
      fitBoundsOptions: { padding: PADDING },
      maxBounds: [w - 0.03, s - 0.02, e + 0.03, n + 0.02],
      minZoom: 12,
      maxZoom: 18,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
    })
    m.touchZoomRotate.disableRotation()
    m.setStyle(BASE_STYLE, {
      transformStyle: (_prev, next) => ({ ...next, layers: next.layers.filter((l) => l.type !== 'symbol') }),
    })
    map.current = m
    if (import.meta.env.DEV) Object.assign(window, { townMap: m }) // for poking at it in devtools
    ready.current = new Promise((resolve) =>
      m.once('load', () => {
        addTownLayers(m, town)
        resolve()
      }),
    )
    m.on('click', (ev) => {
      const { onPickItem, onPickOverlay } = handlers.current
      if (onPickOverlay) {
        const key = nearest(m, ev.point, ['overlay-hit'])?.properties.key
        if (typeof key === 'number') onPickOverlay(key)
      } else if (onPickItem) {
        const id = nearest(m, ev.point, ['items-hit', 'areas-fill'])?.properties.id
        if (typeof id === 'string') onPickItem(id)
      }
    })
    return () => {
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
    map.current?.fitBounds([w, s, e, n], { padding: PADDING, maxZoom: 16.5, duration: 600 })
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

function badge(text: string, color: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'rounded-md px-1.5 py-0.5 text-xs font-bold text-white shadow pointer-events-none'
  el.style.background = color
  el.textContent = text
  return el
}
