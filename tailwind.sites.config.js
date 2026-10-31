/** Tailwind só do site da Jota Car (não mistura com o tema do app) */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./sites/jotacar/index.html', './sites/jotacar/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        snow: '#F5F5F7', // cinza claro Apple
        mist: '#86868B', // cinza secundário Apple
        gold: '#F5C518', // amarelo dourado (com moderação)
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', 'Inter', 'system-ui', 'sans-serif'],
      },
      transitionTimingFunction: { apple: 'cubic-bezier(0.28, 0.11, 0.32, 1)' },
    },
  },
  plugins: [],
};
