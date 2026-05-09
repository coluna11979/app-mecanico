/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand: laranja-ferramenta — força, energia, ação, Brasil
        brand: {
          50:  '#FFF4ED',
          100: '#FFE6D5',
          200: '#FFC9A8',
          300: '#FFA170',
          400: '#FF7A38',
          500: '#FF5C0A', // primária — calor da forja
          600: '#E64500',
          700: '#BF3700',
          800: '#992D00',
          900: '#7A2400',
        },
        // Steel: aço — confiança, profissionalismo, neutralidade técnica
        steel: {
          50:  '#F5F7FA',
          100: '#E8ECF1',
          200: '#CBD3DD',
          300: '#9AA6B6',
          400: '#6B7889',
          500: '#475567',
          600: '#33414F',
          700: '#222C37',
          800: '#151C24',
          900: '#0B1117', // base do dark mode
        },
        // Verde-sinal: ações positivas, disponível, confirmar
        signal: {
          500: '#16C784',
          600: '#0FA56A',
        },
        // Vermelho-alerta: disputa, offline, perigo
        alert: {
          500: '#E5484D',
          600: '#C13A3F',
        },
        // Amarelo-luz: pendente, aguardando
        pending: {
          500: '#F5A524',
          600: '#D88B0F',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'brand': '0 8px 24px -8px rgba(255, 92, 10, 0.45)',
        'card': '0 1px 3px rgba(15,23,32,0.06), 0 8px 24px -12px rgba(15,23,32,0.10)',
        'card-dark': '0 1px 3px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.6)',
      },
      borderRadius: {
        'xl': '14px',
        '2xl': '20px',
      },
      animation: {
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'slide-up':   'slideUp 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 350ms cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in':    'fadeIn 200ms ease-out',
      },
      // Safe-area padding for iPhone notch/home indicator
      padding: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        slideUp: {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-16px) scale(0.96)', opacity: '0' },
          '100%': { transform: 'translateY(0) scale(1)', opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
