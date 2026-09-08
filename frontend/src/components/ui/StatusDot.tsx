import clsx from "clsx";

type Tone = "accent" | "success";

const ON: Record<Tone, string> = {
  accent: "bg-accent",
  success: "bg-lime-600",
};

export function StatusDot({
  on,
  tone = "accent",
  className = "h-3 w-3",
}: {
  on: boolean;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "rounded-full",
        on ? ON[tone] : tone === "accent" ? "bg-accent" : "bg-gray-300",
        className,
      )}
    />
  );
}
