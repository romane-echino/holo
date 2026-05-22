import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App2 from './App2.tsx'
import { AppStateProvider } from './contexts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AppStateProvider>
        <App2 />
      </AppStateProvider>
    </HashRouter>
  </StrictMode>,
)
