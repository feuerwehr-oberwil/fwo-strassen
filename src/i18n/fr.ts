import type { Item } from '../town.ts'
import type { Messages } from './de.ts'

type Kind = Item['kind']
const dec = (m: number) => (m / 1000).toFixed(1).replace('.', ',')
/** How far off a wrong tap was: alone in the summary list, after «Raté» on the card. */
const off = (m: number) =>
  m < 50 ? 'de peu' : m < 1000 ? `à env. ${Math.round(m / 50) * 50} m` : `à env. ${dec(m)} km`

/** «de Bâle», «d’Oberwil». */
const of = (town: string) => (/^[aeiouyhàâéèêîïôû]/i.test(town) ? `d’${town}` : `de ${town}`)

/**
 * French copy (Swiss). Narrow no-break spaces (U+202F) inside « » and before ? ! : ;
 * no-break spaces (U+00A0) after «n°» and before units.
 */
export const fr = {
  appName: 'Quiz des rues',
  page: {
    title: (town: string) => `Quiz des rues ${of(town)}`,
    shortName: 'Rues',
    description: (town: string, brand: string) =>
      `Apprendre les rues et numéros ${of(town)} – pour les chauffeurs (${brand})`,
  },
  recentre: 'Recentrer la carte',
  quit: 'Terminer la série',

  home: {
    due: (n: number) => (n === 1 ? '1 révision à faire' : `${n} révisions à faire`),
    learnNew: 'Apprendre de nouvelles rues',
    allLearned: 'Tout est appris',
    nextRound: 'Prochaine série',
    questions: (n: number, withNew: boolean) =>
      `${n === 1 ? '1 question' : `${n} questions`}${withNew ? ', plus de nouvelles rues' : ''}`,
    start: 'Lancer la série',
    mode: 'Mode',
    modes: {
      find: { label: 'Trouver', hint: 'Nom → carte' },
      name: { label: 'Nommer', hint: 'Carte → nom' },
    },
    numbers: 'Numéros',
    numbersHint: 'Tronçons des longues rues, sinon où est le n° 1',
    intro: 'Présenter les nouvelles rues',
    introHint: 'D’abord montrer, puis demander',
  },
  progress: {
    solid: (n: number) => `${n} acquis`,
    learning: (n: number) => `${n} en cours`,
    fresh: (n: number) => (n > 1 ? `${n} nouveaux` : `${n} nouveau`),
    today: (n: number) => `aujourd’hui ${n}`,
  },
  roundDots: (current: number, total: number, right: number) =>
    `Question ${current} sur ${total}, ${right} ${right > 1 ? 'justes' : 'juste'}`,

  question: {
    check: 'Valider',
    next: 'Suivant',
    results: 'Résultat',
    right: 'Juste',
    off,
    wrong: (m: number) => `Raté – ${off(m)}`,
    target: 'à trouver',
    yourTap: 'ton choix',
    tap: (kind: Kind) => `Touche ${kind === 'area' ? 'le lieu-dit' : 'la rue'}`,
    name: (kind: Kind) => `Comment s’appelle ${kind === 'area' ? 'le lieu-dit orange' : 'la rue orange'} ?`,
    nr: (n: number | string) => `n° ${n}`,
    whereSection: (range: string) => `Où sont les n° ${range} ?`,
    sectionRight: (street: string) => `Juste – ${street}`,
    sectionWrong: (range: string) => `Raté – c’étaient les n° ${range}`,
    whereStart: (n: number) => `Où est le n° ${n} ?`,
    tapEnd: 'Touche une extrémité de la rue',
    giveUp: 'Je ne sais pas',
    gaveUp: 'Pas su',
    passed: 'pas su',
    startRight: (n: number) => `Juste – le n° ${n} est ici`,
    startWrong: (n: number) => `Raté – le n° ${n} est à l’autre bout`,
    range: (from: number, to: number) => `Du n° ${from} au n° ${to}`,
  },
  intro: {
    badge: 'NOUVEAU',
    remember: (n: number, kind: Kind) =>
      `Retiens ${n === 1 ? (kind === 'area' ? 'ce lieu-dit' : 'cette rue') : 'ces rues'}`,
    title: (n: number) => (n === 1 ? '1 nouvelle rue' : `${n} nouvelles rues`),
    km: (m: number) => `${dec(m)} km`,
    area: 'Lieu-dit',
    go: 'Retenu – c’est parti',
  },
  summary: {
    practiceDone: 'Erreurs corrigées',
    roundDone: 'Série terminée',
    score: (right: number, total: number) => `${right} / ${total} ${right > 1 ? 'justes' : 'juste'}`,
    missesBack: 'Les erreurs reviennent à la prochaine série.',
    roundTitle: 'Ta série – touche pour voir',
    perfect: 'Tout juste – bravo !',
    fixMisses: (n: number) => `Corriger les erreurs (${n})`,
    newRound: 'Nouvelle série',
    done: 'Terminé',
  },
  map: {
    loading: 'Chargement de la carte…',
    failed: 'Impossible de charger la carte – vérifie la connexion.',
    station: 'Caserne des pompiers',
  },
  backup: {
    title: 'Sauvegarder ta progression',
    lineHint: 'nom + PIN',
    close: 'Fermer',
    hint: 'Avec un nom et un PIN, continue sur chaque appareil. Toi seul connais le PIN.',
    name: 'Nom',
    pin: 'PIN (4 chiffres)',
    next: 'Continuer',
    notFound: (name: string) => `Aucun profil « ${name} » avec ce PIN`,
    notFoundHint: 'Nouveau ? Alors crée-le. Déjà configuré ? Alors le PIN est sans doute un autre.',
    create: 'Créer',
    changePin: 'Changer le PIN',
    welcome: (name: string) => `Bon retour, ${name} – progression chargée.`,
    status: {
      saving: (name: string) => `${name} · sauvegarde…`,
      saved: (name: string) => `Sauvegardé pour ${name}`,
      offline: (name: string) => `${name} · hors ligne, sera rattrapé`,
    },
    signOut: 'Se déconnecter',
    offline: 'Pas de connexion – réessaie plus tard.',
  },
  install: {
    title: 'Ouvrir comme app – plus de place pour la carte',
    before: 'Dans Safari, touche Partager',
    after: 'puis « Sur l’écran d’accueil ». La barre de Safari disparaît alors.',
    dismiss: 'Masquer le conseil',
  },
} satisfies Messages
