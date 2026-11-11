/** @type {import('tailwindcss').Config} */
// Cores do Bar do Peixe (tiradas do logo): vinho, preto e o âmbar da cerveja.
// A paleta "orange" é trocada pelo vinho do logo, então todo o PDV e o cardápio
// usam as cores do restaurante sem precisar mexer em cada tela.
const vinho = {
  50: '#fdf3f3',
  100: '#fbe4e4',
  200: '#f6c8c8',
  300: '#ec9b9b',
  400: '#df6262',
  500: '#cc2f2f',
  600: '#b01717',
  700: '#8e0b0d',
  800: '#720103',
  900: '#5a0002',
  950: '#330001',
}
export default {
  content: ['./index.html', './pdv.html', './garcom/index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        orange: vinho,
        vinho,
        cerveja: { DEFAULT: '#f5a623', claro: '#fde7b0', escuro: '#c77d0a' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        marca: ['"Archivo Black"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
