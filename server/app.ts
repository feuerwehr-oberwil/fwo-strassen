import { DatabaseSync } from 'node:sqlite'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'

// Progress backup for the Strassen-Trainer. The app keeps progress in the browser and mirrors it
// here under a profile key – the SHA-256 of town, name and PIN, computed in the browser – so it
// survives Safari's storage eviction and moves to a new phone. No accounts, no names, no PINs:
// a hash and an opaque JSON blob of cards.

export const KEY = /^[0-9a-f]{64}$/
export const MAX_BYTES = 200_000 // a full set of cards is ~30 KB
export const RATE = 120 // requests per minute and client IP

export type Options = {
  /** SQLite file; the default keeps everything in memory (tests). */
  dbPath?: string
  /** Origins allowed to call the API from a browser (CORS); empty = same origin only. */
  allowedOrigins?: string[]
}

/**
 * The backup API: `GET /health`, `GET /progress/:key`, `PUT /progress/:key` with `{cards: {...}}`.
 * Run standalone by server/main.ts; the table is the same one the earlier FastAPI service used, so an
 * existing progress.db keeps working.
 */
export function createApp({ dbPath = ':memory:', allowedOrigins = [] }: Options = {}) {
  const db = new DatabaseSync(dbPath)
  // `code` holds the profile key (the name predates name + PIN)
  db.exec('create table if not exists progress (code text primary key, data text not null, updated_at real not null)')
  const select = db.prepare('select data from progress where code = ?')
  const upsert = db.prepare(
    'insert into progress (code, data, updated_at) values (?, ?, ?) ' +
      'on conflict(code) do update set data = excluded.data, updated_at = excluded.updated_at',
  )

  // sliding-window rate limit per client IP, so guessing PINs is slow
  const hits = new Map<string, number[]>()
  const limited = (ip: string) => {
    const now = Date.now()
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000)
    hits.set(ip, [...recent, now])
    return recent.length >= RATE
  }

  const app = new Hono()
  app.use('*', cors({ origin: allowedOrigins, allowMethods: ['GET', 'PUT'], allowHeaders: ['Content-Type'] }))
  app.get('/health', (c) => c.json({ status: 'ok' }))

  app.use('/progress/:key', async (c, next) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
    if (limited(ip)) return c.json({ error: 'too many requests' }, 429)
    if (!KEY.test(c.req.param('key'))) return c.json({ error: 'invalid key' }, 400)
    await next()
  })

  app.get('/progress/:key', (c) => {
    const row = select.get(c.req.param('key'))
    if (!row) return c.json({ error: 'unknown key' }, 404)
    return c.body(String(row.data), 200, { 'Content-Type': 'application/json' })
  })

  const sizeLimit = bodyLimit({ maxSize: MAX_BYTES, onError: (c) => c.json({ error: 'too large' }, 413) })
  app.put('/progress/:key', sizeLimit, async (c) => {
    let data: unknown
    try {
      data = JSON.parse(await c.req.text())
    } catch {
      return c.json({ error: 'not JSON' }, 400)
    }
    if (!isRecord(data) || !isRecord(data.cards)) return c.json({ error: 'expected {cards: {...}}' }, 400)
    upsert.run(c.req.param('key'), JSON.stringify(data), Date.now() / 1000)
    return c.body(null, 204)
  })

  return app
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
