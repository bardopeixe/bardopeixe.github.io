import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Publicado na raiz de https://bardopeixe.github.io:
//   /         → cardápio digital (clientes pedem delivery ou retirada)
//   /garcom/  → app do garçom (lança pedidos das mesas pelo celular)
//   /pdv/     → PDV (gerado à parte por vite.pdv.config.ts, arquivo único)
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { main: 'index.html', garcom: 'garcom/index.html' },
    },
  },
  server: { host: true },
})
