import type { Messages } from './de.ts'
import { messages, type Language } from './messages.ts'

export { messages, type Language }

// The page's language: `strassen-trainer build` (cli/site.ts) and the dev server write region.json's
// into <html lang>, so the copy is known before any data loads. Tests run without a DOM: German.
const lang = typeof document === 'undefined' ? '' : document.documentElement.lang
const isLanguage = (l: string): l is Language => Object.hasOwn(messages, l)
export const language: Language = isLanguage(lang) ? lang : 'de'

/** The UI copy in the page's language, e.g. `t.home.start` or `t.home.due(3)`. */
export const t: Messages = messages[language]
