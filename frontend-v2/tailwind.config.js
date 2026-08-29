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
        /* Carbón neutro (sin sesgo azul), servido por variables CSS: el modo
           claro invierte la rampa en :root (index.css) y TODA la app se
           retematiza sin tocar clases. Estilo Linear/Apple. */
        dark: {
          50: 'rgb(var(--dk-50) / <alpha-value>)',
          100: 'rgb(var(--dk-100) / <alpha-value>)',
          200: 'rgb(var(--dk-200) / <alpha-value>)',
          300: 'rgb(var(--dk-300) / <alpha-value>)',
          400: 'rgb(var(--dk-400) / <alpha-value>)',
          500: 'rgb(var(--dk-500) / <alpha-value>)',
          600: 'rgb(var(--dk-600) / <alpha-value>)',
          700: 'rgb(var(--dk-700) / <alpha-value>)',
          800: 'rgb(var(--dk-800) / <alpha-value>)',
          900: 'rgb(var(--dk-900) / <alpha-value>)',
          950: 'rgb(var(--dk-950) / <alpha-value>)',
        },
      },
      /* Una sola familia de texto y una de cifras. `display` apunta a la misma
         que `sans` a propósito: el titular se distingue por tamaño y peso, no
         por cambiar de fuente. Dos familias distintas para lo mismo era medio
         del ruido visual.

         `mono` no es para código: es para MATRÍCULAS, IMPORTES Y MÉTRICAS.
         Las cifras de Plex Mono son tabulares y alinean en columna. */
      fontFamily: {
        sans: ['Archivo Variable', 'Archivo', 'system-ui', 'sans-serif'],
        display: ['Archivo Variable', 'Archivo', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
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
