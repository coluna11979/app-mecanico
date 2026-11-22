/** Tailwind só do site Jota Car + JC Pneus */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./sites/jc/index.html', './sites/jc/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0B0D10',      // fundo principal
        panel: '#14171C',    // cartões no escuro
        line: '#23272E',     // bordas no escuro
        gold: '#FFC107',     // amarelo das fachadas
        'gold-2': '#E6AD00',
        cloud: '#F4F5F7',    // fundo claro
        slate: '#9AA1AC',    // texto secundário no escuro
      },
      fontFamily: {
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
