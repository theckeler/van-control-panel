import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "solid" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  solid: "bg-on text-ink hover:brightness-95",
  outline: "border border-line bg-surface text-ink hover:bg-page",
  ghost: "text-ink hover:bg-page",
  danger: "bg-danger text-surface hover:brightness-95",
};

// Both sizes keep the 44px tap target. `sm` is for a secondary action in a
// tight row; it is smaller type and padding, not a smaller target.
const SIZE: Record<ButtonSize, string> = {
  sm: "px-3 text-caption font-semibold",
  md: "px-4 text-body font-semibold",
};

export function Button({
  variant = "outline",
  size = "md",
  busy = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and ignores taps. The label stays, so the width holds. */
  busy?: boolean;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  return (
    <button
      data-vc="button"
      type="button"
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      className={clsx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded transition",
        "disabled:cursor-not-allowed disabled:bg-page disabled:text-disabled disabled:hover:bg-page",
        variant === "outline" && "disabled:border-line",
        VARIANT[variant],
        SIZE[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {busy && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
