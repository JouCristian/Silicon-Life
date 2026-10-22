import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'
import { startProjectPersistence } from './projects/persistence'

void startProjectPersistence()

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
