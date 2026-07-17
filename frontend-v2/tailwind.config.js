/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea6800',
        },
        /* Carbón neutro (sin sesgo azul): fondo negro carbón, texto secundario
           con contraste AA, bordes que susurran. Estilo Linear/Apple. */
        dark: {
          50: '#f5f5f7',
          100: '#e7e7ea',
          200: '#cfcfd4',
          300: '#b0b0b8',
          400: '#8f8f98',
          500: '#73737c',
          600: '#4b4b53',
          700: '#333338',
          800: '#222226',
          900: '#131315',
          950: '#0a0a0b',
        },
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk Variable', 'Inter Variable', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.25s ease-out both',
        shimmer: 'shimmer 1.8s linear infinite',
      },
    },
  },
  plugins: [],
}
