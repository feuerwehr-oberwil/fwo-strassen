interface ImportMetaEnv {
  /** Base URL of the progress backup server (server/). Unset = backup off, e.g. in dev. */
  readonly VITE_BACKUP_URL?: string
}

/** region.json's language, inlined at build time (vite.config.ts `define`). */
declare const __LANGUAGE__: import('./region').Region['language']
