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
          solar: colors.lime[500],
          shore: colors.blue[500],
          dc: colors.purple[500],
        },
        soc: {
          good: colors.lime[500],
          mid: colors.amber[500],
          low: colors.red[500],
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
