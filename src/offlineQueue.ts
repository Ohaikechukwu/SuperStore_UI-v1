import { accessToken } from "@/auth";

export type OfflineCommandType =
  | "inventory.adjust" | "inventory.receive" | "inventory.transfer" | "inventory.count"
  | "purchasing.create" | "purchasing.approve" | "purchasing.receive" | "sale.create";
export type OfflineCommandStatus = "pending" | "retrying" | "conflict" | "dead_letter" | "blocked";
export type QueueOwner = { tenantId: string; userId: string };
export type OfflineCommand = {
  commandId: string; deviceId: string; commandType: OfflineCommandType; payload: Record<string, unknown>;
  createdAt: string; attempts: number; tenantId: string | null; userId: string | null;
  status: OfflineCommandStatus; lastAttemptAt: string | null; lastError: string | null;
  serverResult: Record<string, unknown> | null;
};
type QueuedCommandInput = Pick<OfflineCommand, "commandId" | "commandType" | "payload">;
export type SyncResult = { commandId: string; status: string; result?: Record<string, unknown> | null; error?: string | null };
export type QueueSummary = { total: number; actionable: number; needsReview: number; blocked: number; legacy: number };

const DATABASE_NAME = "superstore-health-suite";
const OFFLINE_DISABLED_MESSAGE = "Offline saving is disabled by this security policy. Reconnect before submitting work.";
const EMPTY_SUMMARY: QueueSummary = { total: 0, actionable: 0, needsReview: 0, blocked: 0, legacy: 0 };

function decodeTokenPayload(token: string): Record<string, unknown> | null {
  try {
    const encoded = token.split(".")[1];
    return encoded ? JSON.parse(atob(encoded.replaceAll("-", "+").replaceAll("_", "/"))) as Record<string, unknown> : null;
  } catch { return null; }
}

/** Current identity is derived only from the in-memory access token. */
export function activeQueueOwner(): QueueOwner | null {
  if (typeof window === "undefined") return null;
  const payload = accessToken() ? decodeTokenPayload(accessToken()!) : null;
  const tenantId = typeof payload?.tenant_id === "string" ? payload.tenant_id : null;
  const userId = typeof payload?.sub === "string" ? payload.sub : null;
  return tenantId && userId ? { tenantId, userId } : null;
}

export function currentDeviceId(): string {
  throw new Error(OFFLINE_DISABLED_MESSAGE);
}

/** Offline commands and snapshots must never persist clinical or financial data in a browser. */
export async function enqueue(_command: QueuedCommandInput): Promise<never> {
  throw new Error(OFFLINE_DISABLED_MESSAGE);
}
export async function pendingCommands(_owner = activeQueueOwner()): Promise<OfflineCommand[]> { return []; }
export async function queueSummary(_owner = activeQueueOwner()): Promise<QueueSummary> { return EMPTY_SUMMARY; }
export async function removeCommand(_commandId: string) { /* no browser command store */ }

/** Removes records left by pre-policy releases. */
export async function clearOfflineData() {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

export async function saveOfflineSnapshot(_name: string, _value: unknown, _owner = activeQueueOwner()) { /* disabled */ }
export async function readOfflineSnapshot<T>(_name: string, _owner = activeQueueOwner()): Promise<T | null> { return null; }
export async function flushQueue(_apiBase: string): Promise<SyncResult[]> { return []; }
export async function retryBlockedCommands(_owner = activeQueueOwner()) { /* disabled */ }
