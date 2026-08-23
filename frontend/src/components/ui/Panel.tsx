import React from "react";
import clsx from "clsx";

type Padding = "none" | "sm" | "md" | "lg";

const PADDING: Record<Padding, string> = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

export function Panel({
  padding = "md",
  className,
  style,
  children,
}: {
  padding?: Padding;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "bg-panel-surface border border-panel-border rounded-xl",
        PADDING[padding],
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}
