import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { t } from './i18n'
import { loadTownData } from './townData.ts'
import { Status } from './ui.tsx'

// Ask the browser not to evict our localStorage under storage pressure (best effort).
void navigator.storage?.persist?.()

const root = createRoot(document.getElementById('root')!)
root.render(<Status text={t.map.loading} />)
loadTownData().then(
  (data) =>
    root.render(
      <StrictMode>
        <App data={data} />
      </StrictMode>,
    ),
  (error: unknown) => {
    console.error(error)
    root.render(<Status text={t.map.failed} />)
  },
)
