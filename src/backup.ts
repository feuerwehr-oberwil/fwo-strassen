import { useEffect, useState } from 'react'
import { mergeCards, useStoredState, type Cards, type Progress } from './progress'

// Mirrors the cards to the backup server (server/app.ts) under a profile: name + 4-digit PIN. The
// server only ever sees the SHA-256 of town, name and PIN, never the name or PIN themselves. Each
// sync pulls the backup, merges it in and pushes the result, so devices on one profile converge.
// Works offline: a failed sync just retries on the next answer.

const API = import.meta.env.VITE_BACKUP_URL
export const PIN = /^\d{4}$/

/** «Basti», « basti » and «BASTI» are the same person. */
export function normaliseName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** The profile's key on the server: hex SHA-256 of town, normalised name and PIN. */
export async function profileKey(town: string, name: string, pin: string): Promise<string> {
  const text = `strassen-trainer:v1\n${town}\n${normaliseName(name)}\n${pin}`
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** True if `remote` has a card answered later than ours (only then is a local merge needed). */
export function hasNewer(local: Cards, remote: Cards): boolean {
  return Object.entries(remote).some(([k, c]) => !local[k] || (c.at ?? 0) > (local[k].at ?? 0))
}

/** `name` as typed, shown on this device only; `key` is what the server knows. */
export type Profile = { name: string; key: string }
/** off: no server configured · none: no profile on this device yet. */
export type BackupStatus = 'off' | 'none' | 'saving' | 'saved' | 'offline'

/** Pulls the backup and returns its cards; null if the profile has no backup yet. */
async function pull(key: string): Promise<Cards | null> {
  const r = await fetch(`${API}/progress/${key}`)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`backup ${r.status}`)
  return ((await r.json()) as { cards: Cards }).cards
}

async function push(key: string, cards: Cards): Promise<void> {
  const r = await fetch(`${API}/progress/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cards }),
  })
  if (!r.ok) throw new Error(`backup ${r.status}`)
}

/**
 * The device's profile and sync state for `town` (profiles are per town). `signIn` loads an existing
 * profile, `create` starts one with this device's progress, `signOut` stops syncing and keeps the
 * progress on the device.
 */
export function useBackup(progress: Progress, town: string) {
  const [profile, setProfile] = useStoredState<Profile | null>('fwo-strassen:profile', null)
  const [sync, setSync] = useState<'saving' | 'saved' | 'offline'>('saving')
  const { cards, merge } = progress
  const status: BackupStatus = !API ? 'off' : !profile ? 'none' : sync

  useEffect(() => {
    if (!API || !profile) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const remote = (await pull(profile.key)) ?? {}
        if (cancelled) return
        if (hasNewer(cards, remote))
          merge(remote) // the merge re-runs this effect, which then pushes
        else await push(profile.key, mergeCards(remote, cards))
        if (!cancelled) setSync('saved')
      } catch {
        if (!cancelled) setSync('offline')
      }
    }, 1500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [profile, cards, merge])

  return {
    profile,
    status,
    /** Looks the profile up: found (merged in and linked), missing (nobody has this name + PIN) or offline. */
    async signIn(name: string, pin: string): Promise<'found' | 'missing' | 'offline'> {
      const key = await profileKey(town, name, pin)
      let remote: Cards | null
      try {
        remote = await pull(key)
      } catch {
        return 'offline'
      }
      if (!remote) return 'missing'
      merge(remote)
      setSync('saving')
      setProfile({ name: name.trim(), key })
      return 'found'
    },
    /** Creates the profile with this device's progress. */
    async create(name: string, pin: string): Promise<'created' | 'offline'> {
      const key = await profileKey(town, name, pin)
      try {
        await push(key, cards)
      } catch {
        return 'offline'
      }
      setSync('saved')
      setProfile({ name: name.trim(), key })
      return 'created'
    },
    signOut: () => setProfile(null),
  }
}

export type Backup = ReturnType<typeof useBackup>
