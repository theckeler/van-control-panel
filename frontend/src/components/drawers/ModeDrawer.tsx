import { useVanStore } from "../../store/van";
import { Button, Drawer, KeyValue, Section } from "../ui";

export function ModeDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const mode = useVanStore((s) => s.mode);
  const setMode = useVanStore((s) => s.setMode);

  return (
    <Drawer open={open} onClose={onClose} title="Mode" vc="drawer-mode">
      {!mode ? (
        <p className="text-body text-ink-muted">Loading…</p>
      ) : (
        <>
          <Section title="Van mode">
            <div role="group" aria-label="Van mode" className="grid grid-cols-2 gap-2">
              {mode.available.map((m) => (
                <Button
                  key={m}
                  variant={m === mode.current ? "solid" : "outline"}
                  aria-pressed={m === mode.current}
                  onClick={() => setMode(m)}
                  className="capitalize"
                >
                  {m.replace("_", " ")}
                </Button>
              ))}
            </div>
          </Section>

          <Section title={`What ${mode.config.label} does`}>
            <p className="text-body text-ink-muted">{mode.config.description}</p>
            <KeyValue
              items={[
                {
                  label: "Camera interval",
                  value: `${mode.config.camera_interval_min} min`,
                },
                {
                  label: "Exterior camera only",
                  value: mode.config.camera_exterior_only ? "yes" : "no",
                },
                {
                  label: "Switch circuits off",
                  value: mode.config.shellys_off ? "yes" : "no",
                },
              ]}
            />
            <p className="text-caption text-ink-muted">
              Today a mode sets the camera interval. Circuit schedules are not
              driven by it yet.
            </p>
          </Section>
        </>
      )}
    </Drawer>
  );
}
