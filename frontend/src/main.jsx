import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/electron/renderer'
import './index.css'
import App from './App.jsx'

Sentry.init({
  dsn: "https://424600effbaf13df1282427b2575537a@o4510509929857024.ingest.de.sentry.io/4510509938311248",
  debug: false
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
