/** @type {import('tailwindcss').Config} */
// Tema "Fachada": o vermelho vivo e o preto da placa da frente do restaurante.
// A paleta "orange" é trocada pelo vermelho, então todo o PDV, o cardápio e o garçom
// usam as cores do restaurante sem precisar mexer em cada tela.
const vermelho = {
  50: '#fef2f2',
  100: '#fde3e3',
  200: '#fbc8c9',
  300: '#f69ea0',
  400: '#ee6266',
  500: '#e2343a',
  600: '#d7141a',
  700: '#b40f14',
  800: '#8f0d12',
  900: '#720103',
  950: '#3f0002',
}
export default {
  content: ['./index.html', './pdv.html', './garcom/index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        orange: vermelho,
        vermelho,
        cerveja: { DEFAULT: '#f5a623', claro: '#fde7b0', escuro: '#c77d0a' },
      },
      fontFamily: {
        sans: ['"Archivo Narrow"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        marca: ['"Bebas Neue"', '"Archivo Narrow"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        subir: { from: { opacity: '0', transform: 'translateY(14px)' }, to: { opacity: '1', transform: 'none' } },
        folha: { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        aparecer: { from: { opacity: '0' }, to: { opacity: '1' } },
        pulo: { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.25)' }, '100%': { transform: 'scale(1)' } },
        faixas: { from: { backgroundPosition: '0 0' }, to: { backgroundPosition: '88px 0' } },
      },
      animation: {
        subir: 'subir .45s cubic-bezier(.2,.8,.2,1) both',
        folha: 'folha .32s cubic-bezier(.2,.8,.2,1) both',
        aparecer: 'aparecer .25s ease-out both',
        pulo: 'pulo .35s ease-out',
      },
      boxShadow: {
        cartao: '0 1px 2px rgb(0 0 0 / .06), 0 8px 24px -8px rgb(0 0 0 / .18)',
        flutuante: '0 18px 40px -12px rgb(215 20 26 / .45)',
      },
    },
  },
  plugins: [],
}
