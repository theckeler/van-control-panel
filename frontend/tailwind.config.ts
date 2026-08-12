import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Van brand — dark panel with orange accent matching van exterior
        panel: {
          bg:      '#0d0d0f',
          surface: '#16181c',
          border:  '#222428',
        },
        accent: {
          DEFAULT: '#e07020',  // Orange — matches van ditch lights/steps
          dim:     '#a05010',
        },
        charge: {
          solar:  '#22c55e',
          shore:  '#3b82f6',
          dc:     '#a855f7',
        },
        soc: {
          good:   '#22c55e',
          mid:    '#f59e0b',
          low:    '#ef4444',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
