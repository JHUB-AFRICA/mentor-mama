import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { Button, Card } from "@mentormama/ui";
import {
  discardQueuedSession,
  listQueuedSessions,
  reconcileQueuedSessions,
  type QueuedSession,
} from "../../services/offline";
import type { Placement } from "../../services/api";

interface OfflineSessionQueueProps {
  actorId: string;
  placements: Placement[];
  refreshToken: number;
  onChanged: () => void;
}

export function OfflineSessionQueue({
  actorId,
  placements,
  refreshToken,
  onChanged,
}: OfflineSessionQueueProps) {
  const [entries, setEntries] = useState<QueuedSession[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setEntries(await listQueuedSessions(actorId));
  }

  async function sync() {
    setBusy(true);
    try {
      await reconcileQueuedSessions(actorId);
      await refresh();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [actorId, refreshToken]);

  useEffect(() => {
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [actorId]);

  if (!entries.length) return null;
  const attention = entries.filter((entry) => entry.status === "needs_attention");
  const waiting = entries.filter((entry) => entry.status !== "needs_attention");
  const nameFor = (entry: QueuedSession) => {
    const ids = entry.placementIds ?? [entry.placementId];
    const names = ids.map((id) =>
      placements.find((placement) => placement.id === id)?.student?.name ?? "Assigned student",
    );
    return names.length > 2
      ? `${names.slice(0, 2).join(", ")} +${names.length - 2} more`
      : names.join(", ") || "Saved session";
  };

  return (
    <Card padding="lg" className="mb-7 border-amber-500/30 bg-amber-50">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex gap-3">
          <span className="mt-0.5 rounded-full bg-amber-100 p-2 text-amber-700">
            <CloudOff size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="font-body text-xs font-bold uppercase tracking-[0.12em] text-amber-800">
              Saved on this device
            </p>
            <h2 className="mt-1 font-display text-xl font-bold text-navy">
              {entries.length} session{entries.length === 1 ? "" : "s"} waiting to sync
            </h2>
            <p className="mt-1 font-body text-sm text-navy-muted">
            Each saved session stays here until the server confirms it.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => void sync()} disabled={busy}>
          <RefreshCw size={15} className="mr-2" aria-hidden="true" />
          {busy ? "Syncing…" : "Sync now"}
        </Button>
      </div>
      {attention.length > 0 && (
        <div className="mt-5 border-t border-amber-500/20 pt-5">
          <p className="flex items-center gap-2 font-body text-sm font-bold text-navy">
            <TriangleAlert size={16} className="text-amber-700" aria-hidden="true" />
            Needs attention
          </p>
          <div className="mt-3 space-y-3">
            {attention.map((entry) => (
              <QueueRow
                key={entry.id}
                entry={entry}
                label={nameFor(entry)}
                busy={busy}
                onDiscard={async () => {
                  await discardQueuedSession(entry.id);
                  await refresh();
                  onChanged();
                }}
              />
            ))}
          </div>
        </div>
      )}
      {waiting.length > 0 && (
        <div className="mt-5 border-t border-amber-500/20 pt-5">
          <p className="font-body text-sm font-bold text-navy">Waiting for signal</p>
          <div className="mt-3 space-y-3">
            {waiting.map((entry) => (
              <QueueRow key={entry.id} entry={entry} label={nameFor(entry)} busy={busy} />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function QueueRow({
  entry,
  label,
  busy,
  onDiscard,
}: {
  entry: QueuedSession;
  label: string;
  busy: boolean;
  onDiscard?: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border border-amber-500/20 bg-white/80 p-4 sm:flex-row sm:items-center">
      <div>
        <p className="font-body text-sm font-semibold text-navy">{entry.placementIds?.length ? `${entry.placementIds.length} students · ` : ""}{label}</p>
        <p className="mt-1 font-body text-xs text-navy-muted">
          {entry.input.session_date} · {entry.input.topics.map((topic) => topic.replaceAll("_", " ")).join(", ")}
        </p>
        {entry.message && <p className="mt-2 font-body text-xs text-error">{entry.message}</p>}
      </div>
      {onDiscard && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onDiscard()}
          className="min-h-11 font-body text-sm font-semibold text-error underline underline-offset-4 disabled:opacity-50"
        >
          Discard saved copy
        </button>
      )}
    </div>
  );
}
