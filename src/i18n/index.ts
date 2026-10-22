import { de, type Messages } from './de'
import { en } from './en'
import { fr } from './fr'

/**
 * The UI copy in region.json's language, e.g. `t.home.start` or `t.home.due(3)`. vite.config.ts
 * inlines `__LANGUAGE__`, so this folds to one dictionary and the others drop out of the bundle
 * (a lookup in `messages` would keep all three). A new language needs a branch here too.
 */
export const t: Messages = __LANGUAGE__ === 'fr' ? fr : __LANGUAGE__ === 'en' ? en : de
