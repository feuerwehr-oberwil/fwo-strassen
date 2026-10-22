import region from '../../region.json'
import type { Region } from '../region'
import { de, type Messages } from './de'
import { en } from './en'
import { fr } from './fr'

/** Every language's copy; a language missing here or a key missing in one fails tsc. */
export const messages = { de, fr, en } satisfies Record<Region['language'], Messages>

/** The UI copy in region.json's language, e.g. `t.home.start` or `t.home.due(3)`. */
export const t: Messages = messages[region.language]
