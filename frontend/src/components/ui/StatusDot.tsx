import clsx from "clsx";

type Tone = "accent" | "success";

const ON: Record<Tone, string> = {
  accent: "bg-accent",
  success: "bg-green-500",
};

export function StatusDot({
  on,
  tone = "accent",
  className,
}: {
  on: boolean;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "w-2 h-2 rounded-full flex-shrink-0",
        on ? ON[tone] : "bg-zinc-700",
        className,
      )}
    />
  );
}
