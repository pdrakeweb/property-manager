import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToastProvider } from './components/Toast'

// Importing the modules barrel registers every built-in module with the
// registry as a side-effect (each module's index.ts calls
// `moduleRegistry.register(...)` at module-load time). Phase 0/1 only
// ships the `core` module; later phases will populate the registry with
// optional modules (budget, maintenance, calendar, …).
import './modules'
import { ActiveModuleProvider, assertNoCycles } from './modules/_registry'

// Fail loudly at boot if any registered module has a cyclic `requires`
// chain. Phase 1 has only `core` (zero deps) so this is a no-op today,
// but wiring it now means a malformed Phase 2 module hits the dev
// console immediately rather than producing silent activation deadlock.
assertNoCycles()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <ActiveModuleProvider>
          <App />
        </ActiveModuleProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
