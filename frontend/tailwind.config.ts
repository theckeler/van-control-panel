import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: {
          bg: "rgb(var(--panel-bg) / <alpha-value>)",
          surface: "rgb(var(--panel-surface) / <alpha-value>)",
          // border: "rgb(var(--panel-border) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "#e07020",
          dim: "#a05010",
        },
        charge: {
          solar: colors.lime[600],
          shore: colors.lime[600],
          dc: colors.lime[600],
        },
        soc: {
          good: colors.lime[600],
          mid: colors.amber[600],
          low: colors.red[600],
        },
      },
      fontFamily: {
        // mono: ["JetBrains Mono", "Fira Code", "monospace"],
        // sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
