import React from "react";
import clsx from "clsx";

export function Label({
  as: Tag = "span",
  className,
  children,
}: {
  as?: "span" | "div" | "h1" | "h2" | "h3";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag
      className={clsx(
        "text-xs font-mono text-zinc-500 uppercase tracking-widest",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
