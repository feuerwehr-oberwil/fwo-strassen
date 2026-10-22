import type { Item } from '../town.ts'

type Kind = Item['kind']
const dec = (m: number) => (m / 1000).toFixed(1).replace('.', ',')

/**
 * German copy (Swiss: ss, «», –), the source of truth: fr.ts and en.ts must have the same shape.
 * Parameterised messages are functions that own their plurals and grammar.
 */
export const de = {
  appName: 'Strassen-Trainer',
  /** index.html and the web manifest (cli/site.ts). */
  page: {
    title: (town: string) => `Strassen-Trainer ${town}`,
    shortName: 'Strassen',
    description: (town: string, brand: string) =>
      `Strassen und Hausnummern von ${town} lernen – für die Fahrer der ${brand}`,
  },
  recentre: 'Karte zurücksetzen',
  quit: 'Runde beenden',

  home: {
    due: (n: number) => `${n} ${n === 1 ? 'Wiederholung' : 'Wiederholungen'} fällig`,
    learnNew: 'Neue Strassen lernen',
    allLearned: 'Alles gelernt',
    nextRound: 'Nächste Runde',
    questions: (n: number, withNew: boolean) =>
      `${n === 1 ? '1 Frage' : `${n} Fragen`}${withNew ? ', dazu neue Strassen' : ''}`,
    start: 'Runde starten',
    mode: 'Modus',
    modes: {
      find: { label: 'Finden', hint: 'Name → Karte' },
      name: { label: 'Benennen', hint: 'Karte → Name' },
    },
    numbers: 'Hausnummern',
    numbersHint: 'Abschnitte langer Strassen, bei kürzeren wo Nr. 1 liegt',
    intro: 'Neue Strassen vorstellen',
    introHint: 'Zuerst zeigen, dann abfragen',
    progress: (mode: string, withNumbers: boolean) => `Fortschritt · ${mode}${withNumbers ? ' mit Hausnummern' : ''}`,
  },
  progress: {
    solid: (n: number) => `${n} sicher`,
    learning: (n: number) => `${n} am Lernen`,
    fresh: (n: number) => `${n} neu`,
    today: (n: number) => `heute ${n} beantwortet`,
  },
  /** aria-label of the round's progress bars. */
  roundDots: (current: number, total: number, right: number) => `Frage ${current} von ${total}, ${right} richtig`,

  question: {
    check: 'Prüfen',
    next: 'Weiter',
    results: 'Auswertung',
    right: 'Richtig',
    /** How far off a wrong tap was. */
    wrong: (m: number) =>
      `Daneben – ${m < 50 ? 'knapp' : m < 1000 ? `rund ${Math.round(m / 50) * 50} m` : `rund ${dec(m)} km`}`,
    target: 'gesucht',
    yourTap: 'dein Tipp',
    tap: (kind: Kind) => `Tippe auf ${kind === 'area' ? 'das Gebiet' : 'die Strasse'}`,
    name: (kind: Kind) => `Wie heisst ${kind === 'area' ? 'das orange Gebiet' : 'die orange Strasse'}?`,
    /** A house number or range on map labels and list rows: «Nr. 12», «Nr. 150–189». */
    nr: (n: number | string) => `Nr. ${n}`,
    whereSection: (range: string) => `Wo liegt Nr. ${range}?`,
    sectionRight: (street: string) => `Richtig – ${street}`,
    sectionWrong: (range: string) => `Daneben – das war Nr. ${range}`,
    whereStart: (n: number) => `Wo ist Nr. ${n}?`,
    tapEnd: 'Tippe auf ein Ende der Strasse',
    startRight: (n: number) => `Richtig – Nr. ${n} liegt hier`,
    startWrong: (n: number) => `Daneben – Nr. ${n} ist am anderen Ende`,
    range: (from: number, to: number) => `Nr. ${from} bis Nr. ${to}`,
  },
  intro: {
    badge: 'NEU',
    /** `kind` is the first item's; it only matters for n = 1. */
    remember: (n: number, kind: Kind) =>
      `Merk dir ${n === 1 ? (kind === 'area' ? 'dieses Gebiet' : 'diese Strasse') : 'diese Strassen'}`,
    title: (n: number) => (n === 1 ? '1 neue Strasse' : `${n} neue Strassen`),
    km: (m: number) => `${dec(m)} km`,
    area: 'Gebiet',
    go: 'Gemerkt – los geht’s',
  },
  summary: {
    practiceDone: 'Fehler korrigiert',
    roundDone: 'Runde fertig',
    score: (right: number, total: number) => `${right} / ${total} richtig`,
    missesBack: 'Fehler kommen in der nächsten Runde wieder.',
    missesTitle: 'Deine Fehler – antippen zum Zeigen',
    perfect: 'Alles richtig – stark!',
    fixMisses: (n: number) => `Fehler korrigieren (${n})`,
    newRound: 'Neue Runde',
    done: 'Fertig',
  },
  map: {
    loading: 'Karte lädt …',
    failed: 'Karte konnte nicht laden – Verbindung prüfen.',
    station: 'Feuerwehrmagazin',
  },
  backup: {
    status: { saving: 'wird gesichert …', saved: 'gesichert ✓', offline: 'offline – wird später gesichert' },
    yourCode: 'Dein Code:',
    enterOther: 'Anderen Code eingeben',
    otherLabel: 'Code vom anderen Gerät',
    load: 'Laden',
    close: 'Schliessen',
    help: 'Den Code findest du auf dem anderen Gerät hier unten. Beide Fortschritte werden zusammengeführt.',
    badCode: 'So sieht ein Code aus: rot-schnecke-4821',
    unknownCode: 'Diesen Code gibt es nicht.',
    offline: 'Keine Verbindung – später nochmal versuchen.',
  },
  /** iOS Safari's own labels («Teilen», «Zum Home-Bildschirm») must match the system language. */
  install: {
    title: 'Als App öffnen – mehr Platz für die Karte',
    /** Safari's share icon sits between `before` and `after`. */
    before: 'Tippe in Safari auf Teilen',
    after: 'und dann auf «Zum Home-Bildschirm». Dann fällt die Safari-Leiste weg.',
    dismiss: 'Hinweis ausblenden',
  },
}

export type Messages = typeof de
