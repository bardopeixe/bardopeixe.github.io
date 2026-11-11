import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import App from './App'

// Cardápio digital do espetinho (cliente pede pelo celular → cai no PDV). Publicado em /cardapio/.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
