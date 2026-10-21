import { useEffect, useState } from 'react'
import { mergeCards, useStoredState, type Cards, type Progress } from './progress'

// Mirrors the cards to the backup server (server/app.py) under an anonymous code like
// "rot-schnecke-4821". Each sync pulls the backup, merges it in, and pushes the result, so
// two devices sharing a code converge. Works offline: a failed sync just retries on the next answer.

const API = import.meta.env.VITE_BACKUP_URL
const words = (s: string) => s.split(' ')
const ADJECTIVES = words(
  'rot blau gelb gruen schnell mutig wach stark hell klar frisch ruhig flink treu tapfer wild froh laut leise kalt heiss weit hoch tief fest frei gross klein neu alt flott zack',
)
const NOUNS = words(
  'schnecke leiter schlauch hydrant helm pumpe sirene kompass strahl funke eimer axt seil wache karte fahrer kurve bruecke gasse platz turm tanne linde bach weg hof dorf bahn ampel kreisel tunnel garten',
)
export const CODE = /^[a-z]{2,12}-[a-z]{2,12}-\d{4}$/

export function newCode(rand = Math.random): string {
  const pick = (xs: string[]) => xs[Math.floor(rand() * xs.length)]!
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${String(Math.floor(rand() * 10_000)).padStart(4, '0')}`
}

/** True if `remote` has a card answered later than ours (only then is a local merge needed). */
export function hasNewer(local: Cards, remote: Cards): boolean {
  return Object.entries(remote).some(([k, c]) => !local[k] || (c.at ?? 0) > (local[k].at ?? 0))
}

export type BackupStatus = 'off' | 'saving' | 'saved' | 'offline'

/** Pulls the backup and returns its cards; null if the code has no backup yet. */
async function pull(code: string): Promise<Cards | null> {
  const r = await fetch(`${API}/progress/${code}`)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`backup ${r.status}`)
  return ((await r.json()) as { cards: Cards }).cards
}

async function push(code: string, cards: Cards): Promise<void> {
  const r = await fetch(`${API}/progress/${code}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cards }),
  })
  if (!r.ok) throw new Error(`backup ${r.status}`)
}

/** The device's backup code and sync state; `restore` switches to another device's code. */
export function useBackup(progress: Progress) {
  const [code, setCode] = useStoredState('fwo-strassen:code', () => newCode())
  const [status, setStatus] = useState<BackupStatus>(API ? 'saving' : 'off')
  const { cards, merge } = progress

  useEffect(() => {
    if (!API) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const remote = (await pull(code)) ?? {}
        if (cancelled) return
        if (hasNewer(cards, remote))
          merge(remote) // the merge re-runs this effect, which then pushes
        else await push(code, mergeCards(remote, cards))
        if (!cancelled) setStatus('saved')
      } catch {
        if (!cancelled) setStatus('offline')
      }
    }, 1500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [code, cards, merge])

  return {
    code,
    status,
    /** Continue with the progress saved under another code. Resolves to an error message or null. */
    async restore(input: string): Promise<string | null> {
      const other = input.trim().toLowerCase()
      if (!CODE.test(other)) return 'So sieht ein Code aus: rot-schnecke-4821'
      try {
        if (!(await pull(other))) return 'Diesen Code gibt es nicht.'
      } catch {
        return 'Keine Verbindung – später nochmal versuchen.'
      }
      setStatus('saving')
      setCode(other)
      return null
    },
  }
}

export type Backup = ReturnType<typeof useBackup>
