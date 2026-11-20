import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { toast } from "../../store/toast";
import { formatBytes } from "../../lib/format";
import type { BackupStatus, DiskImageStatus } from "../../types";
import { Button, Dialog, Drawer, KeyValue, Section } from "../ui";

export function BackupDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Backup" vc="drawer-backup">
      <BackupBody />
    </Drawer>
  );
}

function BackupBody() {
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api.system.backupStatus().then(
        (b) => !cancelled && setBackup(b),
        () => !cancelled && setBackup(null),
      );
    void load();
    const t = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  async function doDownload() {
    setDownloading(true);
    try {
      const res = await fetch(api.system.backupUrl(), { credentials: "same-origin" });
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      const blob = await res.blob();
      const name =
        res.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/)?.[1] ??
        "van_power.db.gz";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${name}`);
    } catch (err) {
      toast.error(
        `Backup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <Section title="Database">
        <KeyValue
          items={[
            {
              label: "Size",
              value: backup?.db_size_bytes
                ? `${(backup.db_size_bytes / 1024 / 1024).toFixed(1)} MB`
                : "—",
            },
            {
              label: "Readings",
              value: backup?.row_counts?.readings_raw?.toLocaleString() ?? "—",
            },
            {
              label: "Nightly job",
              value: backup?.last_scheduled_run
                ? new Date(backup.last_scheduled_run).toLocaleString()
                : "never run",
              tone: backup?.last_scheduled_run ? undefined : "warn",
            },
            ...(backup?.pending_failed
              ? [
                  {
                    label: "Unsent",
                    value: `${backup.pending_failed} held on the Pi`,
                    tone: "warn" as const,
                  },
                ]
              : []),
          ]}
        />
      </Section>

      <Section title="Download">
        <Button variant="solid" busy={downloading} onClick={doDownload}>
          {downloading ? "Preparing…" : "Download database"}
        </Button>
        <p className="text-caption text-ink-muted">
          A gzipped snapshot. Readings only, no credentials.
        </p>
      </Section>

      <DiskImageSection />
    </>
  );
}

// A full copy of the Pi's SD card, written to the USB stick, so a dead card can
// be restored in minutes. The Pi keeps no memory of an image across a van-api
// restart, so "not started" means not since the last restart, not never.
function DiskImageSection() {
  const [image, setImage] = useState<DiskImageStatus | null>(null);
  const [confirm, setConfirm] = useState<"start" | "stop" | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api.system.diskImageStatus().then(
        (s) => !cancelled && setImage(s),
        () => {},
      );
    void load();
    const t = setInterval(load, 5_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const running = image?.state === "running";
  const failed = image?.state === "error";

  async function start() {
    setConfirm(null);
    setWorking(true);
    try {
      const result = await api.system.diskImageStart();
      if (!result.ok) toast.error(`Couldn't start the image: ${result.message}`);
      else toast.info("Image started. It takes about 45 minutes.");
      // The job begins in the background; give it a moment before asking.
      await new Promise((resolve) => setTimeout(resolve, 800));
      setImage(await api.system.diskImageStatus());
    } catch (err) {
      toast.error(
        `Couldn't start the image: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setWorking(false);
    }
  }

  async function stop() {
    setConfirm(null);
    setWorking(true);
    try {
      await api.system.diskImageCancel();
      toast.info("Image stopped and the partial file deleted");
      setImage(await api.system.diskImageStatus());
    } catch (err) {
      toast.error(
        `Couldn't stop the image: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setWorking(false);
    }
  }

  const status = !image?.state
    ? "Not started since the last restart"
    : running
      ? "Running"
      : failed
        ? "Failed"
        : "Done";

  return (
    <Section title="SD card image">
      <KeyValue
        items={[
          {
            label: "Status",
            value: status,
            tone: failed ? "bad" : running ? "warn" : undefined,
          },
          ...(image?.bytes_written != null
            ? [
                {
                  label: running ? "Written so far" : "Image size",
                  value: formatBytes(image.bytes_written),
                },
              ]
            : []),
        ]}
      />
      {failed && image?.error && (
        <p role="alert" className="text-body text-danger-text">
          {image.error}
        </p>
      )}
      {running ? (
        <Button busy={working} onClick={() => setConfirm("stop")}>
          Stop image
        </Button>
      ) : (
        <Button busy={working} onClick={() => setConfirm("start")}>
          Create SD card image
        </Button>
      )}
      <p className="text-caption text-ink-muted">
        A full copy of the SD card on the USB stick, for restoring a dead card.
        About 45 minutes, and it replaces the image already on the stick.
      </p>

      <Dialog
        open={confirm === "start"}
        onClose={() => setConfirm(null)}
        title="Replace the image on the USB stick?"
        vc="dialog-disk-image-start"
        actions={
          <>
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="solid" onClick={start}>
              Start image
            </Button>
          </>
        }
      >
        This copies the whole SD card to the USB stick and takes about 45
        minutes. The image already on the stick is replaced as soon as it
        starts, so a failed run leaves none. The Pi works harder meanwhile. The
        stick must be plugged in.
      </Dialog>

      <Dialog
        open={confirm === "stop"}
        onClose={() => setConfirm(null)}
        title="Stop the image?"
        vc="dialog-disk-image-stop"
        actions={
          <>
            <Button onClick={() => setConfirm(null)}>Keep going</Button>
            <Button variant="danger" onClick={stop}>
              Stop image
            </Button>
          </>
        }
      >
        The partial file is deleted. The image that was on the stick was already
        replaced when this one started.
      </Dialog>
    </Section>
  );
}
