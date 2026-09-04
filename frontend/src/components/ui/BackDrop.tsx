import clsx from "clsx";

export function BackDrop({
  className,
  onClick,
}: {
  className?: string;
  onClick?: () => void;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <div
      className={clsx(
        "absolute inset-0 bg-sky-100/60 backdrop-blur-sm",
        className,
      )}
      onClick={onClick}
      aria-hidden="true"
    />
  );
}
