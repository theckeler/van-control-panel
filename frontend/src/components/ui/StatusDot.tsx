import clsx from "clsx";

type Tone = "accent" | "success";

const ON: Record<Tone, string> = {
  accent: "bg-accent",
  success: "bg-lime-400",
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
        "min-w-[0.5rem] min-h-[0.5rem] rounded-full flex-shrink-0",
        on ? ON[tone] : tone === "accent" ? "bg-accent" : "bg-gray-300",
        className,
      )}
    />
  );
}
