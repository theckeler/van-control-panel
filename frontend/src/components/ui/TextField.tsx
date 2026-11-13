import clsx from "clsx";
import { useId, type InputHTMLAttributes } from "react";

// A labelled input. 16px at every width (text-input), or iPhones zoom on tap.
export function TextField({
  label,
  className,
  ...props
}: { label: string; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "className">) {
  const id = useId();
  return (
    <div data-vc="text-field" className={clsx("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-label uppercase text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        className="min-h-11 rounded border border-line bg-surface px-3 text-input text-ink placeholder:text-ink-subtle"
        {...props}
      />
    </div>
  );
}
