import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-plus-jakarta)', 'sans-serif'],
      },
      colors: {
        'ica-bueno': 'var(--ica-bueno)',
        'ica-regular': 'var(--ica-regular)',
        'ica-alerta': 'var(--ica-alerta)',
        'ica-preemergencia': 'var(--ica-preemergencia)',
        'ica-emergencia': 'var(--ica-emergencia)',
        'ica-sindatos': 'var(--ica-sindatos)',
      },
    },
  },
  plugins: [],
}

export default config
