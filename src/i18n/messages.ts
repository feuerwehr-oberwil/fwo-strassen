import type { Region } from '../region.ts'
import { de, type Messages } from './de.ts'
import { en } from './en.ts'
import { fr } from './fr.ts'

/** Every language's copy; a language missing here or a key missing in one fails tsc. */
export const messages = { de, fr, en } satisfies Record<Region['language'], Messages>
export type Language = keyof typeof messages
