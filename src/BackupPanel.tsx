import { useState } from 'react'
import type { Backup } from './backup'

const STATUS = {
  off: '',
  saving: 'wird gesichert …',
  saved: 'gesichert ✓',
  offline: 'offline – wird später gesichert',
} as const

/** Shows the device's backup code and lets you continue with another device's code. */
export function BackupPanel({ backup }: { backup: Backup }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (backup.status === 'off') return null

  const submit = async () => {
    const err = await backup.restore(input)
    setError(err)
    if (!err) {
      setOpen(false)
      setInput('')
    }
  }

  return (
    <div className="flex flex-col gap-1.5 text-xs text-stone-500">
      <div className="flex flex-wrap items-center gap-x-2">
        <span>Dein Code:</span>
        <code className="rounded bg-stone-100 px-1.5 py-0.5 font-semibold text-stone-800 select-all">
          {backup.code}
        </code>
        <span>{STATUS[backup.status]}</span>
        {!open && (
          <button className="ml-auto underline" onClick={() => setOpen(true)}>
            Anderen Code eingeben
          </button>
        )}
      </div>
      {open && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="rot-schnecke-4821"
            autoCapitalize="none"
            autoCorrect="off"
            className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-sm text-stone-900"
          />
          <button type="submit" className="rounded-lg bg-stone-900 px-3 text-sm font-semibold text-white">
            Laden
          </button>
          <button type="button" onClick={() => setOpen(false)} className="px-1 text-sm">
            ✕
          </button>
        </form>
      )}
      {error && <div className="text-red-600">{error}</div>}
      {open && !error && (
        <div>Den Code findest du auf dem anderen Gerät hier unten. Beide Fortschritte werden zusammengeführt.</div>
      )}
    </div>
  )
}
