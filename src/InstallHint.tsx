import { t } from './i18n'
import { useStoredState } from './progress'
import { inMobileSafariTab } from './standalone'

// iOS Safari never hides its toolbar on a page that doesn't scroll, and no web API can hide it.
// Opened from the home screen, the app runs without it (manifest: display standalone).
const inSafariTab = inMobileSafariTab(navigator)

/** On the start screen in iPhone/iPad Safari: how to add the app to the home screen. ✕ hides it for good. */
export function InstallHint() {
  const [dismissed, setDismissed] = useStoredState('fwo-strassen:install-hint-dismissed', false)
  if (!inSafariTab || dismissed) return null
  return (
    <section className="relative flex gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600">
        <ShareIcon className="size-5" />
      </div>
      <div className="flex-1 pr-6">
        <div className="font-bold">{t.install.title}</div>
        <div className="text-sm text-stone-600">
          {t.install.before} <ShareIcon className="inline size-4 align-[-3px]" /> {t.install.after}
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label={t.install.dismiss}
        className="absolute top-1.5 right-1.5 grid size-9 place-items-center text-stone-400"
      >
        ✕
      </button>
    </section>
  )
}

/** Safari's share symbol: a box with an arrow up. */
function ShareIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12M8 7l4-4 4 4M5 11v9h14v-9" />
    </svg>
  )
}
