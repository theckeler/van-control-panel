import clsx from "clsx";
import React from "react";

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
        "text-xs  text-zinc-500 uppercase tracking-widest",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
