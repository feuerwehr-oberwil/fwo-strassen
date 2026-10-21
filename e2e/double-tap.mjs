// Device-class regression check for «double tap on the map answers instead of zooming» (iPhone).
// Playwright WebKit with the iPhone 13 profile and real touch taps; needs `pnpm dev` on :5310.
//
//   PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
//   LD_LIBRARY_PATH=$HOME/.cache/pwlibs/ext/usr/lib/x86_64-linux-gnu node e2e/double-tap.mjs
//
// Green when: a double tap on a street zooms in and does not answer, and a single tap answers.
import { devices, webkit } from '@playwright/test'

const URL = process.env.URL ?? 'http://127.0.0.1:5310/'
const browser = await webkit.launch()
const results = []

async function freshPage() {
  const context = await browser.newContext({ ...devices['iPhone 13'] })
  await context.addInitScript(() => {
    localStorage.setItem('fwo-strassen:settings', JSON.stringify({ mode: 'find', withNumbers: false }))
  })
  const page = await context.newPage()
  await page.goto(URL)
  await page.waitForFunction(() => window.townMap?.loaded() && window.townMap.getLayer('items-hit'))
  await page.waitForTimeout(1200) // let the initial fit animation settle
  // a point on the street that is asked, so a tap there would answer
  const point = await page.evaluate(() => {
    const m = window.townMap
    const f = m.queryRenderedFeatures({ layers: ['items-hit'] })[0]
    const line = f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates[0]
    const p = m.project(line[Math.floor(line.length / 2)])
    const r = m.getCanvas().getBoundingClientRect()
    return { x: r.left + p.x, y: r.top + p.y }
  })
  const answered = () => page.evaluate(() => /Richtig|Das war/.test(document.querySelector('main').innerText))
  const zoom = () => page.evaluate(() => window.townMap.getZoom())
  return { context, page, point, answered, zoom }
}

// a quick and a slow double tap (time between the two taps)
for (const gap of [120, 250]) {
  const { context, page, point, answered, zoom } = await freshPage()
  const before = await zoom()
  await page.touchscreen.tap(point.x, point.y)
  await page.waitForTimeout(gap)
  await page.touchscreen.tap(point.x, point.y)
  await page.waitForTimeout(1000)
  const after = await zoom()
  results.push({ check: `double tap (${gap} ms) zooms`, ok: after > before + 0.5, before, after })
  results.push({ check: `double tap (${gap} ms) does not answer`, ok: !(await answered()) })
  await context.close()
}
{
  const { context, page, point, answered } = await freshPage()
  await page.touchscreen.tap(point.x, point.y)
  await page.waitForTimeout(800)
  results.push({ check: 'single tap answers', ok: await answered() })
  await context.close()
}

await browser.close()
for (const r of results)
  console.log(
    r.ok ? 'GREEN' : 'RED  ',
    r.check,
    r.before !== undefined ? `(zoom ${r.before.toFixed(2)} → ${r.after.toFixed(2)})` : '',
  )
process.exit(results.every((r) => r.ok) ? 0 : 1)
