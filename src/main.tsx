import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import AuthenticatedApp from './app/AuthenticatedApp'
import { UpdateProvider } from './app/updateContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UpdateProvider><AuthenticatedApp /></UpdateProvider>
  </StrictMode>,
)
