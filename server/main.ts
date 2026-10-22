import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'

// The backup API on its own (Railway): `node server/main.ts`.
// Env: PORT, DB_PATH (default progress.db), ALLOWED_ORIGINS (comma-separated app origins).

const dbPath = process.env.DB_PATH ?? 'progress.db'
mkdirSync(dirname(dbPath), { recursive: true })
const app = createApp({
  dbPath,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
})
const port = Number(process.env.PORT ?? 8000)
const server = serve({ fetch: app.fetch, port }, () => console.log(`backup API on :${port}, db ${dbPath}`))
// as a container's PID 1, Node ignores SIGTERM unless told otherwise; Railway sends it on redeploy
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)))
