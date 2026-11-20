import { useState } from "react";
import { useCameraStore } from "../../store/camera";
import { Button, Drawer, KeyValue, Section } from "../ui";

// Camera controls. The photo history lives in the History drawer's Photos tab.
export function CameraDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Camera" vc="drawer-camera">
      <CameraBody />
    </Drawer>
  );
}

function CameraBody() {
  const { enabled, setEnabled, capture } = useCameraStore();
  const [capturing, setCapturing] = useState(false);

  return (
    <Section title="Camera">
      <KeyValue
        items={[
          {
            label: "Status",
            value: enabled ? "on" : "off",
            tone: enabled ? undefined : "warn",
          },
        ]}
      />
      <Button onClick={() => setEnabled(!enabled)}>
        {enabled ? "Turn camera off" : "Turn camera on"}
      </Button>
      <Button
        variant="solid"
        busy={capturing}
        disabled={!enabled}
        onClick={async () => {
          setCapturing(true);
          await capture();
          setCapturing(false);
        }}
      >
        Take a photo now
      </Button>
    </Section>
  );
}
