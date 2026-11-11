import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import Espetinho from './Espetinho.tsx'

// Versão do PDV em um único arquivo HTML (npm run build:pdv), para abrir direto no Chrome do caixa.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Espetinho />
  </StrictMode>,
)
