import clsx from "clsx";
import React from "react";
import { useSettingsStore } from "../../store/settings";

export function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const spacing = useSettingsStore((s) => s.spacing);
  const px = `${spacing * 4}px`;

  return (
    <div
      className={clsx(
        "flex flex-col bg-panel-surface border border-panel-border rounded",
        className,
      )}
      style={{ padding: px, gap: px }}
    >
      {children}
    </div>
  );
}

export function Stack({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const gap = useSettingsStore((s) => s.gap);
  const px = `${gap * 4}px`;

  return (
    <div
      className={clsx("flex flex-col", className)}
      style={{ padding: px, gap: px }}
    >
      {children}
    </div>
  );
}
