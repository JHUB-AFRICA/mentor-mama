import { getCommandStatus, isRetryableRequestFailure, logSession, logSessionBatch, type SessionBatchInput, type SessionInput } from "./api";

export type QueuedSessionStatus = "queued" | "syncing" | "needs_attention";

export interface QueuedSession {
  id: string;
  actorId: string;
  placementId: string;
  placementIds?: string[];
  input: SessionInput;
  createdAt: string;
  status: QueuedSessionStatus;
  message: string | null;
}

export interface SessionDraft {
  id: string;
  actorId: string;
  placementId: string;
  input: SessionInput;
  updatedAt: string;
}

const databaseName = "mentor-mama-offline";
const databaseVersion = 1;
const queueStore = "session-queue";
const draftStore = "session-drafts";

function draftId(actorId: string, placementId: string) {
  return `${actorId}:${placementId}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(queueStore)) {
        const store = database.createObjectStore(queueStore, { keyPath: "id" });
        store.createIndex("actorId", "actorId", { unique: false });
      }
      if (!database.objectStoreNames.contains(draftStore)) {
        database.createObjectStore(draftStore, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function readAll<T>(storeName: string): Promise<T[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as T[]);
    transaction.oncomplete = () => database.close();
  });
}

async function put<T>(storeName: string, value: T): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
  });
}

async function remove(storeName: string, id: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(id);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
  });
}

export async function listQueuedSessions(actorId: string): Promise<QueuedSession[]> {
  const entries = await readAll<QueuedSession>(queueStore);
  return entries
    .filter((entry) => entry.actorId === actorId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function queueSession(
  actorId: string,
  placementId: string,
  input: SessionInput,
  id: string = crypto.randomUUID(),
): Promise<QueuedSession> {
  const entry: QueuedSession = {
    id,
    actorId,
    placementId,
    input,
    createdAt: new Date().toISOString(),
    status: "queued",
    message: null,
  };
  await put(queueStore, entry);
  return entry;
}

export async function queueSessionBatch(
  actorId: string,
  input: SessionBatchInput,
  id: string = crypto.randomUUID(),
): Promise<QueuedSession> {
  const [placementId, ...rest] = input.placement_ids;
  const entry: QueuedSession = {
    id,
    actorId,
    placementId,
    placementIds: [placementId, ...rest],
    input,
    createdAt: new Date().toISOString(),
    status: "queued",
    message: null,
  };
  await put(queueStore, entry);
  return entry;
}

export async function updateQueuedSession(
  entry: QueuedSession,
  change: Pick<QueuedSession, "status" | "message">,
): Promise<QueuedSession> {
  const updated = { ...entry, ...change };
  await put(queueStore, updated);
  return updated;
}

export async function discardQueuedSession(id: string): Promise<void> {
  await remove(queueStore, id);
}

export async function getSessionDraft(
  actorId: string,
  placementId: string,
): Promise<SessionDraft | null> {
  const drafts = await readAll<SessionDraft>(draftStore);
  return drafts.find((draft) => draft.id === draftId(actorId, placementId)) ?? null;
}

export async function saveSessionDraft(
  actorId: string,
  placementId: string,
  input: SessionInput,
): Promise<void> {
  await put<SessionDraft>(draftStore, {
    id: draftId(actorId, placementId),
    actorId,
    placementId,
    input,
    updatedAt: new Date().toISOString(),
  });
}

export async function clearSessionDraft(actorId: string, placementId: string): Promise<void> {
  await remove(draftStore, draftId(actorId, placementId));
}

export async function submitSession(
  actorId: string,
  placementId: string,
  input: SessionInput,
  commandId: string = crypto.randomUUID(),
): Promise<{ status: "synced" | "queued" }> {
  try {
    await logSession(placementId, input, commandId);
    return { status: "synced" };
  } catch (cause) {
    if (!isRetryableRequestFailure(cause)) throw cause;
    await queueSession(actorId, placementId, input, commandId);
    return { status: "queued" };
  }
}

export async function submitSessionBatch(
  actorId: string,
  input: SessionBatchInput,
  commandId: string = crypto.randomUUID(),
): Promise<{ status: "synced" | "queued"; createdCount?: number; duplicateCount?: number }> {
  try {
    const result = await logSessionBatch(input, commandId);
    return { status: "synced", createdCount: result.created_count, duplicateCount: result.duplicate_count };
  } catch (cause) {
    if (!isRetryableRequestFailure(cause)) throw cause;
    await queueSessionBatch(actorId, input, commandId);
    return { status: "queued" };
  }
}

export async function reconcileQueuedSession(entry: QueuedSession): Promise<QueuedSessionStatus | "synced"> {
  await updateQueuedSession(entry, { status: "syncing", message: null });
  try {
    const commandStatus = await getCommandStatus(entry.id);
    if (commandStatus === "committed") {
      await discardQueuedSession(entry.id);
      return "synced";
    }
    if (commandStatus === "in_progress") {
      await updateQueuedSession(entry, {
        status: "queued",
        message: "This session is still being confirmed. We will try again.",
      });
      return "queued";
    }
    if (entry.placementIds?.length) {
      const { placement_ids, ...sessionInput } = entry.input as SessionBatchInput;
      void placement_ids;
      await logSessionBatch({ ...sessionInput, placement_ids: entry.placementIds }, entry.id);
    } else {
      await logSession(entry.placementId, entry.input, entry.id);
    }
    await discardQueuedSession(entry.id);
    return "synced";
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "This session could not be synced.";
    const status: QueuedSessionStatus = isRetryableRequestFailure(cause)
      ? "queued"
      : "needs_attention";
    await updateQueuedSession(entry, { status, message });
    return status;
  }
}

export async function reconcileQueuedSessions(actorId: string): Promise<void> {
  const entries = await listQueuedSessions(actorId);
  for (const entry of entries) {
    // A browser can close while a request is in flight. Replaying that entry
    // is safe because its command UUID is stable; leaving it in `syncing`
    // forever would violate the visible-reconciliation promise.
    await reconcileQueuedSession(entry);
  }
}
