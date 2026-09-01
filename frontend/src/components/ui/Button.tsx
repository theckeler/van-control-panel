import clsx from "clsx";
import React from "react";

type Variant = "outline" | "ghost" | "danger";
type Size = "icon" | "sm" | "md";

const VARIANT: Record<Variant, string> = {
  outline: "border border-panel-border text-gray-800",
  ghost: "border border-panel-border text-gray-800",
  danger: "border bg-amber-900 text-white",
};

const SIZE: Record<Size, string> = {
  icon: "p-4",
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
      className={clsx("rounded", VARIANT[variant], SIZE[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}
