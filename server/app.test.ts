import { describe, expect, it } from 'vitest'
import { createApp, RATE } from './app.ts'

const CODE = 'rot-schnecke-4821'
const put = (app: ReturnType<typeof createApp>, code: string, body: string) =>
  app.request(`/progress/${code}`, { method: 'PUT', body, headers: { 'Content-Type': 'application/json' } })

describe('backup API', () => {
  it('saves and loads a backup', async () => {
    const app = createApp()
    const data = { cards: { 'find:1': { box: 2, due: 5, at: 1 } } }
    expect((await put(app, CODE, JSON.stringify(data))).status).toBe(204)
    expect(await (await app.request(`/progress/${CODE}`)).json()).toEqual(data)
  })

  it('tells unknown codes from malformed ones', async () => {
    const app = createApp()
    expect((await app.request('/progress/blau-leiter-0000')).status).toBe(404)
    expect((await app.request('/progress/DROP-table')).status).toBe(400)
  })

  it('rejects the wrong shape and oversized bodies', async () => {
    const app = createApp()
    expect((await put(app, CODE, '{"nope":1}')).status).toBe(400)
    expect((await put(app, CODE, 'not json')).status).toBe(400)
    expect((await put(app, CODE, JSON.stringify({ cards: { x: 'y'.repeat(250_000) } }))).status).toBe(413)
  })

  it('rate-limits per client IP', async () => {
    const app = createApp()
    const get = (ip: string) => app.request('/progress/gelb-hydrant-1234', { headers: { 'x-forwarded-for': ip } })
    for (let i = 0; i < RATE; i++) await get('1.2.3.4')
    expect((await get('1.2.3.4')).status).toBe(429)
    expect((await get('5.6.7.8')).status).toBe(404)
  })

  it('lets only the configured origins call it from a browser', async () => {
    const app = createApp({ allowedOrigins: ['https://strassen.fwo.li'] })
    const from = async (origin: string) =>
      (await app.request('/health', { headers: { Origin: origin } })).headers.get('access-control-allow-origin')
    expect(await from('https://strassen.fwo.li')).toBe('https://strassen.fwo.li')
    expect(await from('https://evil.example')).toBeNull()
  })
})
