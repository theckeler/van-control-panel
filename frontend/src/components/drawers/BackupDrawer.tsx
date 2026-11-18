import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { toast } from "../../store/toast";
import type { BackupStatus } from "../../types";
import { Button, Drawer, KeyValue, Section } from "../ui";

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
    </>
  );
}
