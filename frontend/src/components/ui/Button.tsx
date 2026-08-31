import clsx from "clsx";
import React from "react";

type Variant = "outline" | "ghost" | "danger";
type Size = "icon" | "sm" | "md";

const VARIANT: Record<Variant, string> = {
  outline:
    "border border-panel-border text-zinc-300 hover:border-zinc-500 hover:text-zinc-100",
  ghost:
    "border border-panel-border text-zinc-500 hover:border-zinc-500 hover:text-zinc-300",
  danger:
    "border border-red-800 bg-red-950/40 text-red-300 hover:bg-red-950/70",
};

const SIZE: Record<Size, string> = {
  icon: "p-1.5",
  sm: "px-3 py-1 text-xs",
  md: "px-4 py-2 text-sm",
};

export function Button({
  variant = "outline",
  size = "md",
  className,
  children,
  ...props
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={clsx(
        "rounded-lg  transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-panel-bg",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
