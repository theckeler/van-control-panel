import { useId, type ReactNode } from "react";

// A titled group inside a drawer.
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      data-vc="section"
      aria-labelledby={id}
      className="flex flex-col gap-2"
    >
      <h3 id={id} className="text-label uppercase text-ink-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}
