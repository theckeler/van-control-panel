import React from "react";
import clsx from "clsx";

type Size = "sm" | "md";

const SIZE: Record<Size, string> = {
  sm: "rounded-lg p-3",
  md: "rounded-lg p-4",
};

export function SelectableTile({
  selected,
  onClick,
  size = "md",
  disabled,
  className,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  size?: Size;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        SIZE[size],
        "text-left border transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-panel-bg",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        selected
          ? "bg-accent/15 border-accent text-accent"
          : "bg-panel-bg border-panel-border text-zinc-500 hover:border-zinc-500 hover:text-zinc-300",
        className,
      )}
    >
      {children}
    </button>
  );
}
