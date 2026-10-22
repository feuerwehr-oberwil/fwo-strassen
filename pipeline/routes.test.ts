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
  const { best, path } = network(osm, { crs: LV95, barriers: [], accessRoads: [] }).shortestTree(1)
  expect(best.has(2)).toBe(false)
  expect(path(3)).toEqual([1, 4, 3])
})
