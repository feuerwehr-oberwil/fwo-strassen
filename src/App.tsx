import { Suspense, use, useState } from 'react'
import { useNumbers } from './modes/numbers'
import { useQuiz } from './modes/quiz'
import { useProgress } from './progress'
import { townPromise } from './town'
import { TownMap } from './TownMap'
import { Segmented } from './ui'

type Mode = 'find' | 'name' | 'numbers'
const MODES = [
  { value: 'find', label: 'Name → Karte' },
  { value: 'name', label: 'Karte → Name' },
  { value: 'numbers', label: 'Hausnummern' },
] as const

export default function App() {
  return (
    <Suspense fallback={<div className="grid h-dvh place-items-center text-stone-500">Karte wird geladen …</div>}>
      <Trainer />
    </Suspense>
  )
}

// One map for all modes; every mode keeps its own question while you switch tabs.
function Trainer() {
  const town = use(townPromise)
  const progress = useProgress()
  const [mode, setMode] = useState<Mode>('find')
  const views = {
    find: useQuiz('find', town, progress),
    name: useQuiz('name', town, progress),
    numbers: useNumbers(town, progress),
  }
  const view = views[mode]

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-stone-100 text-stone-900">
      <div className="relative flex-1">
        <TownMap town={town} refitKey={mode} {...view.map} />
        <div className="pointer-events-none absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] flex flex-col gap-2 *:pointer-events-auto">
          <Segmented options={MODES} value={mode} onChange={setMode} />
          {view.prompt}
        </div>
      </div>
      <div className="z-10 flex flex-col gap-2 rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_#0002]">
        {view.sheet}
      </div>
    </main>
  )
}
