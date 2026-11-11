import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import App from './App'

// App do garçom: cada garçom entra com o próprio e-mail e lança os pedidos das mesas.
// Os pedidos caem no PDV (aba Mesas), que imprime a comanda da cozinha.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
