import type { Config } from "tailwindcss";

// Design tokens (docs/DESIGN-SYSTEM.md): page, surface, line, ink, on, off,
// info, warn, danger and their *-text variants. Values are explicit hex from
// the Figma file (Tailwind v4 palette), not Tailwind's built-in v3 scale,
// which has different greens.
//
// Each color is a CSS variable holding an "r g b" triplet (index.css), so
// a dark set can be added later without touching a component, and opacity
// modifiers like bg-ink/50 still work.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces and text
        page: token("page"),
        surface: token("surface"),
        line: token("line"),
        ink: {
          DEFAULT: token("ink"),
          muted: token("ink-muted"),
          subtle: token("ink-subtle"),
        },
        disabled: token("disabled"),
        control: token("control"),

        // State fills (always paired with `ink` text) and the darker text
        // variants used for colored words on a light surface.
        on: { DEFAULT: token("on"), text: token("on-text") },
        off: { DEFAULT: token("off"), text: token("off-text") },
        info: { DEFAULT: token("info"), text: token("info-text") },
        warn: { DEFAULT: token("warn"), text: token("warn-text") },
        danger: { DEFAULT: token("danger"), text: token("danger-text") },
      },
      // Type scale. Nothing below 12px. Use these, not text-[11px].
      fontSize: {
        display: ["2.25rem", { lineHeight: "2.5rem", fontWeight: "700" }],
        title: ["1.25rem", { lineHeight: "1.75rem", fontWeight: "700" }],
        value: ["1.125rem", { lineHeight: "1.5rem", fontWeight: "600" }],
        body: ["0.875rem", { lineHeight: "1.25rem", fontWeight: "400" }],
        label: [
          "0.75rem",
          { lineHeight: "1rem", fontWeight: "600", letterSpacing: "0.06em" },
        ],
        caption: ["0.75rem", { lineHeight: "1rem", fontWeight: "400" }],
        input: ["1rem", { lineHeight: "1.5rem", fontWeight: "400" }],
      },
      // The one shadow, for drawers and dialogs. Cards are flat.
      boxShadow: {
        overlay: "0 10px 30px -5px rgb(16 24 40 / 0.25)",
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
