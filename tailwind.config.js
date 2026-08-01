/** @type {import('tailwindcss').Config} */
export default {
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
        panel: 'var(--bg-panel)',
      }
    },
  },
  plugins: [],
}
