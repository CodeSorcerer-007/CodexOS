/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        cyan: {
          DEFAULT: 'rgb(var(--accent-cyan))',
        },
        panel: 'var(--app-panel)',
        'app-bg': 'var(--app-bg)',
        'app-surface': 'var(--app-surface)',
        'app-surface-muted': 'var(--app-surface-muted)',
        'app-panel': 'var(--app-panel)',
        'app-border': 'var(--app-border)',
        'app-text': 'var(--app-text)',
        'app-text-muted': 'var(--app-text-muted)',
        'app-glow': 'var(--app-glow)',
      }
    },
  },
  plugins: [],
}
