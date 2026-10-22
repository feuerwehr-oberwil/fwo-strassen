import type { Region } from '../region'
import { de, type Messages } from './de'
import { en } from './en'
import { fr } from './fr'

/** Every language's copy, for vite.config.ts (page title, manifest) and tests; the app uses `t`. */
export const messages = { de, fr, en } satisfies Record<Region['language'], Messages>
