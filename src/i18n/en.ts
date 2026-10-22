import type { Item } from '../town.ts'
import type { Messages } from './de.ts'

type Kind = Item['kind']
const dec = (m: number) => (m / 1000).toFixed(1)
/** How far off a wrong tap was: alone in the summary list, after «Missed» on the card. */
const off = (m: number) =>
  m < 50 ? 'close' : m < 1000 ? `about ${Math.round(m / 50) * 50} m off` : `about ${dec(m)} km off`

const s = (n: number) => (n === 1 ? '' : 's')

/** English copy. */
export const en = {
  appName: 'Street Trainer',
  page: {
    title: (town: string) => `Street Trainer ${town}`,
    shortName: 'Streets',
    description: (town: string, brand: string) =>
      `Learn the streets and house numbers of ${town} – for the drivers of ${brand}`,
  },
  recentre: 'Reset map',
  quit: 'End round',

  home: {
    due: (n: number) => `${n} review${s(n)} due`,
    learnNew: 'Learn new streets',
    allLearned: 'All learned',
    nextRound: 'Next round',
    questions: (n: number, withNew: boolean) => `${n} question${s(n)}${withNew ? ', plus new streets' : ''}`,
    start: 'Start round',
    mode: 'Mode',
    modes: {
      find: { label: 'Find', hint: 'Name → map' },
      name: { label: 'Name', hint: 'Map → name' },
    },
    numbers: 'House numbers',
    numbersHint: 'Sections of long streets, on shorter ones where No. 1 is',
    intro: 'Introduce new streets',
    introHint: 'Show first, then ask',
    progress: (mode: string, withNumbers: boolean) => `Progress · ${mode}${withNumbers ? ' with house numbers' : ''}`,
  },
  progress: {
    solid: (n: number) => `${n} known`,
    learning: (n: number) => `${n} learning`,
    fresh: (n: number) => `${n} new`,
    today: (n: number) => `${n} answered today`,
  },
  roundDots: (current: number, total: number, right: number) => `Question ${current} of ${total}, ${right} right`,

  question: {
    check: 'Check',
    next: 'Next',
    results: 'Results',
    right: 'Right',
    off,
    wrong: (m: number) => `Missed – ${off(m)}`,
    target: 'correct',
    yourTap: 'your tap',
    tap: (kind: Kind) => `Tap the ${kind === 'area' ? 'area' : 'street'}`,
    name: (kind: Kind) => `What is the orange ${kind === 'area' ? 'area' : 'street'} called?`,
    nr: (n: number | string) => `No. ${n}`,
    whereSection: (range: string) => `Where are Nos. ${range}?`,
    sectionRight: (street: string) => `Right – ${street}`,
    sectionWrong: (range: string) => `Missed – that was Nos. ${range}`,
    whereStart: (n: number) => `Where is No. ${n}?`,
    tapEnd: 'Tap one end of the street',
    startRight: (n: number) => `Right – No. ${n} is here`,
    startWrong: (n: number) => `Missed – No. ${n} is at the other end`,
    range: (from: number, to: number) => `No. ${from} to No. ${to}`,
  },
  intro: {
    badge: 'NEW',
    remember: (n: number, kind: Kind) =>
      `Remember ${n === 1 ? (kind === 'area' ? 'this area' : 'this street') : 'these streets'}`,
    title: (n: number) => `${n} new street${s(n)}`,
    km: (m: number) => `${dec(m)} km`,
    area: 'Area',
    go: 'Got it – let’s go',
  },
  summary: {
    practiceDone: 'Mistakes fixed',
    roundDone: 'Round done',
    score: (right: number, total: number) => `${right} / ${total} right`,
    missesBack: 'Mistakes come back next round.',
    roundTitle: 'Your round – tap to see',
    perfect: 'All right – great job!',
    fixMisses: (n: number) => `Fix mistakes (${n})`,
    newRound: 'New round',
    done: 'Done',
  },
  map: {
    loading: 'Loading map…',
    failed: 'Map failed to load – check your connection.',
    station: 'Fire station',
  },
  backup: {
    title: 'Save your progress',
    hint: 'Keep learning on any device with a name and PIN. Only you know the PIN.',
    name: 'Name',
    pin: 'PIN (4 digits)',
    next: 'Continue',
    notFound: (name: string) => `No profile “${name}” with this PIN`,
    notFoundHint: 'New here? Then create it. Already set up? Then the PIN must be a different one.',
    create: 'Create',
    changePin: 'Change PIN',
    welcome: (name: string) => `Welcome back, ${name} – progress loaded.`,
    status: {
      saving: (name: string) => `${name} · saving…`,
      saved: (name: string) => `Saved as ${name}`,
      offline: (name: string) => `${name} · offline, will catch up`,
    },
    signOut: 'Sign out',
    offline: 'No connection – try again later.',
  },
  install: {
    title: 'Open as an app – more room for the map',
    before: 'In Safari, tap Share',
    after: 'then “Add to Home Screen”. The Safari bar goes away.',
    dismiss: 'Hide tip',
  },
} satisfies Messages
