import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/electron/renderer'
import './index.css'
import App from './App.jsx'

// Detectar si estamos en Electron antes de iniciar Sentry
const isElectron = navigator.userAgent.toLowerCase().includes(' electron/');

if (isElectron) {
  Sentry.init({
    dsn: "https://15bf6ed890e254dc94272dd272911ddd@o4510509929857024.ingest.de.sentry.io/4510509939032144",
    debug: false,
    sendDefaultPii: true
  });
} else {
  console.log('ℹ️ Running in Web Browser: Sentry Electron disabled');
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
