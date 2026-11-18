import clsx from "clsx";
import { Icon, type IconName } from "./Icon";
import { ICON_TONE, type IconButtonTone } from "./IconButton";

// The IconButton look without the button: a 44px circle that reports a state
// and does nothing when tapped. Its name is for screen readers and the
// tooltip; the state is also written in words somewhere nearby, because a
// colored circle alone cannot carry it.
export function IconCircle({
  icon,
  label,
  tone = "control",
  className,
}: {
  icon: IconName;
  label: string;
  tone?: IconButtonTone;
  className?: string;
}) {
  return (
    <span
      data-vc="icon-circle"
      role="img"
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full",
        ICON_TONE[tone],
        className,
      )}
    >
      <Icon name={icon} />
    </span>
  );
}
