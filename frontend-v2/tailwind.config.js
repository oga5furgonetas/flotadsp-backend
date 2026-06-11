/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          400: '#fb923c',
          500: '#f97316',
          600: '#ea6800',
        },
        dark: {
          50: '#f4f5f8',
          100: '#e4e6ec',
          200: '#c8ccd6',
          300: '#a8aebc',
          400: '#8892a4',
          500: '#5c6578',
          600: '#444c5e',
          700: '#333a4a',
          800: '#222631',
          900: '#16181f',
          950: '#0a0b0f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.25s ease-out both',
      },
    },
  },
  plugins: [],
}
