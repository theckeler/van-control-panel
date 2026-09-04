import clsx from "clsx";
import React from "react";

type Variant = "outline" | "ghost" | "danger";
type Size = "icon" | "sm" | "md";

const VARIANT: Record<Variant, string> = {
  outline: "border border-panel-border text-gray-800",
  ghost: "border-transparent text-gray-800",
  danger: "border bg-red-900 text-red-100",
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
  bold = false,
  uppercase = false,
  fullWidth,
  children,
  ...props
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
  bold?: boolean;
  uppercase?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  // Icon buttons default to hugging their content — an icon stretched to
  // fill its row is always wrong. Explicit fullWidth still wins either way.
  const isFullWidth = fullWidth ?? size !== "icon";

  return (
    <button
      type="button"
      className={clsx(
        "px-4 py-3 rounded border",
        VARIANT[variant],
        SIZE[size],
        className,
        bold && "font-bold",
        uppercase && "uppercase",
        isFullWidth && "w-full",
      )}
      {...props}
    >
      {children}
    </button>
  );
}
