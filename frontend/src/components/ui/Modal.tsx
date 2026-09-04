import clsx from "clsx";
import React from "react";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { BackDrop } from "./BackDrop";

export function Modal({
  open,
  onCancel,
  className,
  children,
}: {
  open: boolean;
  onCancel?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const dialogRef = useModalBehavior(open, onCancel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <BackDrop onClick={onCancel} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="progress-modal-title"
        tabIndex={-1}
        className={clsx(
          "relative bg-panel-surface border border-panel-border rounded p-6 w-full max-w-sm shadow-xl focus:outline-none flex flex-col items-center gap-3",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
