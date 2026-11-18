import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { LibraryProvider } from './store/library'
import { ThemeProvider } from './lib/theme'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <LibraryProvider>
        <App />
      </LibraryProvider>
    </ThemeProvider>
  </StrictMode>,
)
