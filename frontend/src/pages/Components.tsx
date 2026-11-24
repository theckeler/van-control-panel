import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  DeviceRow,
  Dialog,
  Drawer,
  Icon,
  IconButton,
  IconCircle,
  KeyValue,
  Progress,
  Section,
  Stat,
  StatusDot,
  StatusList,
  SwitchTile,
  TileButton,
  type IconName,
  type SwitchState,
} from "../components/ui";

// Every component in every state, so each can be checked without the van.
// Dev only (see main.tsx): it is not part of the production bundle.
const ICONS: IconName[] = [
  "settings", "power", "wifi", "camera", "video", "video-off", "battery",
  "save", "images", "lightbulb", "lightbulb-off", "sliders", "history", "x",
  "check",
];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-title">{title}</h2>
      {children}
    </section>
  );
}

export function Components() {
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState<"confirm" | "busy" | null>(null);
  const [tile, setTile] = useState<SwitchState>("off");

  return (
    <div className="min-h-dvh bg-page p-4 text-ink md:p-6">
      <main className="mx-auto flex max-w-2xl flex-col gap-8">
        <h1 className="text-title">Component set</h1>

        <Block title="Button">
          <div className="flex flex-wrap gap-2">
            <Button variant="solid">Solid</Button>
            <Button>Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button size="sm">Small</Button>
            <Button busy>Busy</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Block>

        <Block title="IconButton">
          <div className="flex flex-wrap gap-2">
            <IconButton icon="settings" label="Settings" />
            <IconButton icon="video" label="Camera, on" tone="on" />
            <IconButton icon="video-off" label="Camera, off" tone="off" />
            <IconButton icon="wifi" label="WiFi, connected" tone="on" />
            <IconButton icon="power" label="Power" tone="on" />
            <IconButton icon="save" label="Backup" badge={3} />
            <IconButton icon="images" label="Photos" disabled />
            <IconButton icon="refresh" label="Check again" tone="quiet" />
            <IconButton icon="refresh" label="Checking" tone="quiet" busy />
            <IconCircle icon="battery" tone="on" label="Live" />
            <IconCircle icon="battery" label="Battery, offline" />
          </div>
          <div className="flex flex-wrap gap-3 rounded bg-surface p-3">
            {ICONS.map((n) => (
              <span key={n} className="flex flex-col items-center gap-1 text-caption text-ink-muted">
                <Icon name={n} />
                {n}
              </span>
            ))}
          </div>
        </Block>

        <Block title="TileButton">
          <div className="grid max-w-xs grid-cols-2 gap-2">
            <TileButton icon="wifi" label="WiFi" tone="on" />
            <TileButton icon="video-off" label="Camera off" tone="off" />
            <TileButton icon="save" label="Backup" />
            <TileButton icon="power" label="Power" />
          </div>
        </Block>

        <Block title="SwitchTile">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <SwitchTile label="Garage" state="on" onToggle={() => {}} />
            <SwitchTile label="USB" state="off" onToggle={() => {}} />
            <SwitchTile label="Side" state="offline" onToggle={() => {}} />
            <SwitchTile
              label="PS Input 1"
              state="offline"
              onToggle={() => {}}
              onRecheck={() => {}}
            />
            <SwitchTile
              label="PS Input 2"
              state="offline"
              onToggle={() => {}}
              onRecheck={() => {}}
              checking
            />
            <SwitchTile label="Roof" state="busy" onToggle={() => {}} />
            <SwitchTile
              label="Tap me"
              state={tile}
              onToggle={() => {
                setTile("busy");
                setTimeout(() => setTile((s) => (s === "busy" ? "on" : "off")), 800);
              }}
            />
          </div>
        </Block>

        <Block title="Card, Progress, Stat">
          <Card title="Battery" vc="battery-card">
            <span className="text-display tabular-nums text-on-text">87.3%</span>
            <Progress value={87.3} label="Battery charge" />
            <div className="grid grid-cols-3 gap-2">
              <Stat value="13.4V" />
              <Stat value="78W" />
              <Stat value="75°F" />
            </div>
          </Card>
          <Card title="Battery" offline lastSeen="4 min ago">
            <span className="text-display tabular-nums">87.3%</span>
            <Progress value={87.3} label="Battery charge" offline />
            <div className="grid grid-cols-3 gap-2">
              <Stat value="13.4V" offline />
              <Stat value="78W" offline />
              <Stat value="75°F" offline />
            </div>
          </Card>
          <Card title="Stat tones">
            <div className="grid grid-cols-2 gap-2">
              <Stat value="13.6V" />
              <Stat label="In" value="99W" tone="good" />
              <Stat value="12.4V" tone="warn" hint="low" />
              <Stat label="Out" value="320W" tone="bad" hint="heavy" />
            </div>
          </Card>
          <Card title="Low">
            <Progress value={12} label="Battery charge" valueText="12%" />
            <Stat variant="row" label="Voltage" value="12.1V" />
          </Card>
        </Block>

        <Block title="DeviceRow">
          <DeviceRow name="EcoFlow" value="16.7%">
            <Progress value={16.7} label="EcoFlow charge" />
          </DeviceRow>
          <DeviceRow name="Starlink" value="28 ms · 0.7 Mbps" detail="obstructed" />
          <DeviceRow name="CFX5" value="64.4°F" detail="Running" />
          <DeviceRow
            name="Fridge"
            state="offline"
            value="39.6°F · set 39°F"
            detail="Offline · last seen 4m ago"
            onRecheck={() => {}}
          />
          <DeviceRow
            name="Starlink"
            state="offline"
            value="Dish unreachable"
            detail="Offline"
            onRecheck={() => {}}
            checking
          />
          <DeviceRow name="Shore" state="off" detail="Unplugged" />
          <DeviceRow name="Starlink" state="offline" />
        </Block>

        <Block title="Badge, StatusDot, KeyValue">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Neutral</Badge>
            <Badge tone="on">Connected</Badge>
            <Badge tone="off">Camera off</Badge>
            <Badge tone="warn">Low SOC</Badge>
            <span className="flex items-center gap-1 text-caption"><StatusDot tone="on" />on</span>
            <span className="flex items-center gap-1 text-caption"><StatusDot tone="off" />off</span>
            <span className="flex items-center gap-1 text-caption"><StatusDot tone="warn" />warn</span>
            <span className="flex items-center gap-1 text-caption"><StatusDot />unknown</span>
          </div>
          <div className="rounded border border-line bg-surface px-4">
            <KeyValue
              items={[
                { label: "CPU temp", value: "52°C" },
                { label: "Memory", value: "71%", tone: "warn" },
                { label: "Disk", value: "96%", tone: "bad" },
              ]}
            />
          </div>
        </Block>

        <Block title="StatusList">
          <div className="max-w-60">
            <StatusList
              items={[
                { name: "VanNet", detail: "Connected · 5GHz", tone: "on" },
                { name: "Hotspot", detail: "Weak signal", tone: "warn" },
                { name: "Ethernet", detail: "No cable", tone: "unknown" },
              ]}
            />
          </div>
        </Block>

        <Block title="Drawer, Dialog">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDrawer(true)}>Open drawer</Button>
            <Button onClick={() => setDialog("confirm")}>Confirm dialog</Button>
            <Button
              onClick={() => {
                setDialog("busy");
                setTimeout(() => setDialog(null), 3000);
              }}
            >
              Busy dialog (3s)
            </Button>
          </div>
        </Block>
      </main>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Backup"
        vc="drawer-backup"
        footer={<Button variant="danger">Delete everything</Button>}
      >
        <Section title="Database">
          <KeyValue
            items={[
              { label: "Size", value: "41 MB" },
              { label: "Readings", value: "182,400" },
            ]}
          />
        </Section>
        <Section title="Download">
          <Button variant="solid">Download database</Button>
        </Section>
        {Array.from({ length: 12 }, (_, i) => (
          <p key={i} className="text-body text-ink-muted">
            Filler line {i + 1}, to check the body scrolls and the footer stays.
          </p>
        ))}
      </Drawer>

      <Dialog
        open={dialog === "confirm" || dialog === "busy"}
        onClose={() => setDialog(null)}
        title={dialog === "busy" ? "Restarting…" : "Shut down the Pi?"}
        busy={dialog === "busy"}
        vc="dialog-power"
        actions={
          dialog === "confirm" ? (
            <>
              <Button onClick={() => setDialog(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => setDialog(null)}>
                Shut down
              </Button>
            </>
          ) : undefined
        }
      >
        {dialog === "busy"
          ? "Waiting for the API to come back."
          : "The Pi will not come back until someone powers it on in the van."}
      </Dialog>
    </div>
  );
}
