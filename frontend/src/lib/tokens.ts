// Recharts takes color strings, not classes. This reads a design token from
// the CSS variable in index.css so charts use the same single source as
// everything else, and never a hex copy.
export function token(name: string): string {
  if (typeof document === "undefined") return "currentColor";
  const rgb = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim();
  return rgb ? `rgb(${rgb})` : "currentColor";
}
