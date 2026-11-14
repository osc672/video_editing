/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      opacity: {
        3: '0.03',
        6: '0.06',
        8: '0.08',
        12: '0.12',
        15: '0.15',
        18: '0.18',
        22: '0.22',
        35: '0.35',
        45: '0.45',
        55: '0.55',
        65: '0.65',
        85: '0.85',
      },
      colors: {
        ink: {
          950: '#07090e',
          900: '#0c1017',
          800: '#131822',
          700: '#1a2230',
          600: '#232e42',
          500: '#32415d',
        },
        brand: {
          500: '#3b82f6',
          600: '#2563eb',
        },
        cyan: {
          glow: '#06b6d4',
          accent: '#22d3ee',
        },
      },
      backgroundImage: {
        'app-gradient': 'radial-gradient(circle at 50% 0%, #161f33 0%, #0a0d14 70%, #06080c 100%)',
        'panel-gradient': 'linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.015) 100%)',
        'card-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
      },
      boxShadow: {
        panel: '0 24px 48px -12px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        glow: '0 0 0 1px rgba(6,182,212,0.4), 0 0 24px -4px rgba(6,182,212,0.35)',
        card: '0 12px 28px -8px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.07)',
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s linear infinite',
        floaty: 'floaty 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
