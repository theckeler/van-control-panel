import clsx from "clsx";
import React from "react";

export function SelectableTile({
  selected,
  onClick,
  disabled,
  className,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  // size?: Size;
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
      className={clsx(className)}
    >
      {children}
    </button>
  );
}
