import { useState } from 'react'
import { PIN, type Backup } from './backup'
import { t } from './i18n'

type Step = { kind: 'closed' } | { kind: 'form' } | { kind: 'missing' } | { kind: 'welcome' }

/**
 * Name + PIN backup on the start screen. Without a profile: one line «Fortschritt sichern ›» that
 * opens in place into the sign-in form; if nobody has that name + PIN, it asks before creating a
 * profile (a wrong PIN looks exactly like a new person to the server). With a profile: one status
 * line with «Abmelden».
 */
export function BackupPanel({ backup }: { backup: Backup }) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [step, setStep] = useState<Step>({ kind: 'closed' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (backup.status === 'off') return null

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    await action()
    setBusy(false)
  }
  const signIn = () =>
    run(async () => {
      const result = await backup.signIn(name, pin)
      if (result === 'offline') setError(t.backup.offline)
      else setStep({ kind: result === 'found' ? 'welcome' : 'missing' })
    })
  const create = () =>
    run(async () => {
      if ((await backup.create(name, pin)) === 'offline') setError(t.backup.offline)
      else setStep({ kind: 'closed' })
    })

  if (backup.profile) {
    const status = backup.status === 'none' ? 'saving' : backup.status
    return (
      <div className="flex flex-col gap-2">
        {step.kind === 'welcome' && (
          <div role="status" className="rounded-2xl bg-green-50 p-3 text-sm text-green-900 ring-1 ring-green-200">
            {t.backup.welcome(backup.profile.name)}
          </div>
        )}
        <div className="flex items-center gap-2 px-1 text-xs text-stone-600">
          <Cloud className={status === 'offline' ? 'text-amber-500' : 'text-green-600'} />
          <span>{t.backup.status[status](backup.profile.name)}</span>
          <button
            className="ml-auto min-h-11 underline"
            onClick={() => {
              backup.signOut()
              setPin('')
              setStep({ kind: 'closed' })
            }}
          >
            {t.backup.signOut}
          </button>
        </div>
      </div>
    )
  }

  if (step.kind === 'closed' || step.kind === 'welcome')
    return (
      <button
        onClick={() => setStep({ kind: 'form' })}
        className="flex min-h-11 items-center gap-2 rounded-2xl bg-white px-4 text-left text-sm shadow-sm"
      >
        <Cloud className="text-stone-400" />
        <span className="font-semibold">{t.backup.title}</span>
        <span className="text-xs text-stone-500">{t.backup.lineHint}</span>
        <span className="ml-auto text-stone-400" aria-hidden="true">
          ›
        </span>
      </button>
    )

  const close = (
    <button
      type="button"
      onClick={() => {
        setError(null)
        setStep({ kind: 'closed' })
      }}
      aria-label={t.backup.close}
      className="-m-2 grid size-11 shrink-0 place-items-center text-stone-400"
    >
      ✕
    </button>
  )

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
      {step.kind === 'missing' ? (
        <>
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <div className="text-sm font-semibold">{t.backup.notFound(name.trim())}</div>
              <div className="text-xs text-stone-600">{t.backup.notFoundHint}</div>
            </div>
            {close}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={busy}
              onClick={() => void create()}
              className="min-h-11 rounded-xl bg-stone-900 px-3 text-sm font-semibold text-white"
            >
              {t.backup.create}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setPin('')
                setStep({ kind: 'form' })
              }}
              className="min-h-11 rounded-xl bg-stone-100 px-3 text-sm font-semibold text-stone-800"
            >
              {t.backup.changePin}
            </button>
          </div>
        </>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void signIn()
          }}
        >
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <div className="text-sm font-semibold">{t.backup.title}</div>
              <div className="text-xs text-stone-500">{t.backup.hint}</div>
            </div>
            {close}
          </div>
          <label className="flex flex-col gap-1 text-xs text-stone-600">
            {t.backup.name}
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="nickname"
              autoCorrect="off"
              // 16 px text: smaller makes iPhone zoom into the page on focus
              className="min-h-11 rounded-lg border border-stone-300 px-3 text-base text-stone-900"
            />
          </label>
          <div className="flex items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-stone-600">
              {t.backup.pin}
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="••••"
                className="min-h-11 w-32 rounded-lg border border-stone-300 px-3 text-center text-base tracking-[0.5em] text-stone-900"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !name.trim() || !PIN.test(pin)}
              className="min-h-11 flex-1 rounded-xl bg-stone-900 px-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? '…' : t.backup.next}
            </button>
          </div>
        </form>
      )}
      {error && (
        <div role="alert" className="text-xs text-red-700">
          {error}
        </div>
      )}
    </section>
  )
}

/** Cloud: synced (green) or waiting for the network (amber). */
function Cloud({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`size-4 shrink-0 ${className}`} fill="currentColor" aria-hidden="true">
      <path d="M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 8.98z" />
    </svg>
  )
}
