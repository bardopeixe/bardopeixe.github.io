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
      // cantos quase retos, como placa e etiqueta (nada de bolha arredondada)
      borderRadius: {
        lg: '3px',
        xl: '4px',
        '2xl': '4px',
        '3xl': '6px',
      },
    },
  },
  plugins: [],
}
