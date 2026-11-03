import { expect, it } from 'vitest'
import { network, turnCost, TURN_S, type Osm } from './routes.ts'
import { LV95 } from './sources/swisstopo.ts'

it('turns cost more to the left and nothing straight on', () => {
  expect([turnCost(0, 10), turnCost(0, 90), turnCost(0, -90), turnCost(0, 170)]).toEqual([
    0,
    TURN_S.right,
    TURN_S.left,
    TURN_S.sharp,
  ])
})

it('routes go around a barrier', () => {
  // a straight road 1–2–3 with a gate on 2, and a detour 1–4–3
  const node = (id: number, lon: number, lat: number, tags?: Record<string, string>) =>
    ({ type: 'node', id, lon, lat, tags }) as const
  const osm: Osm = {
    elements: [
      node(1, 7.55, 47.51),
      node(2, 7.551, 47.51, { barrier: 'gate' }),
      node(3, 7.552, 47.51),
      node(4, 7.551, 47.511),
      { type: 'way', id: 10, nodes: [1, 2, 3], tags: { highway: 'residential' } },
      { type: 'way', id: 11, nodes: [1, 4, 3], tags: { highway: 'residential' } },
    ],
  }
  const { best, path } = network(osm, { crs: LV95, barriers: [], footpaths: [], accessRoads: [] }).shortestTree(1)
  expect(best.has(2)).toBe(false)
  expect(path(3)).toEqual([1, 4, 3])
})

it('a footpath fix takes its way out of the network, name included', () => {
  // a main road 1–2 with a side street 3–4 off it, which OSM also connects to 2 over a path 2–4
  const node = (id: number, lon: number, lat: number) => ({ type: 'node', id, lon, lat }) as const
  const osm: Osm = {
    elements: [
      node(1, 7.55, 47.51),
      node(2, 7.552, 47.51),
      node(3, 7.55, 47.511),
      node(4, 7.552, 47.511),
      { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'secondary', name: 'Main' } },
      { type: 'way', id: 11, nodes: [1, 3], tags: { highway: 'residential', name: 'Cross' } },
      { type: 'way', id: 12, nodes: [3, 4], tags: { highway: 'residential', name: 'Side' } },
      { type: 'way', id: 13, nodes: [4, 2], tags: { highway: 'residential', name: 'Side' } },
    ],
  }
  const net = network(osm, { crs: LV95, barriers: [], footpaths: [[7.552, 47.5105]], accessRoads: [] })
  expect(net.names.get(2)).toEqual(new Set(['Main']))
  expect(net.shortestTree(1).path(4)).toEqual([1, 3, 4])
})
