import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { accessToken, apiFetch } from "@/auth";

export type OfflineCommandType =
  | "inventory.adjust"
  | "inventory.receive"
  | "inventory.transfer"
  | "inventory.count"
  | "purchasing.create"
  | "purchasing.approve"
  | "purchasing.receive"
  | "sale.create";

export type OfflineCommandStatus =
  | "pending"
  | "retrying"
  | "conflict"
  | "dead_letter"
  | "blocked";

export type QueueOwner = { tenantId: string; userId: string };

export type OfflineCommand = {
  commandId: string;
  deviceId: string;
  commandType: OfflineCommandType;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  tenantId: string | null;
  userId: string | null;
  status: OfflineCommandStatus;
  lastAttemptAt: string | null;
  lastError: string | null;
  serverResult: Record<string, unknown> | null;
};

type QueuedCommandInput = {
  commandId: string;
  commandType: OfflineCommandType;
  payload: Record<string, unknown>;
};

export type SyncResult = {
  commandId: string;
  status: string;
  result?: Record<string, unknown> | null;
  error?: string | null;
};

export type QueueSummary = {
  total: number;
  actionable: number;
  needsReview: number;
  blocked: number;
  legacy: number;
};

interface SuiteDB extends DBSchema {
  commands: {
    key: string;
    value: OfflineCommand;
    indexes: {
      "by-created-at": string;
      "by-owner-created": [string, string, string];
    };
  };
  snapshots: {
    key: string;
    value: { id: string; tenantId: string; userId: string; name: string; updatedAt: string; value: unknown };
    indexes: { "by-owner-updated": [string, string, string] };
  };
}

type StoredCommand = Partial<OfflineCommand> & Pick<
  OfflineCommand,
  "commandId" | "deviceId" | "commandType" | "payload" | "createdAt" | "attempts"
>;

const DATABASE_NAME = "superstore-health-suite";
const DATABASE_VERSION = 3;
const LEGACY_COMMAND_MESSAGE = "This command was saved by an older version of the app and has no tenant owner. It has been retained safely and will not be sent automatically.";
let database: Promise<IDBPDatabase<SuiteDB>> | undefined;
let activeFlush: Promise<SyncResult[]> | undefined;

function getDatabase() {
  database ??= openDB<SuiteDB>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion === 0) {
        const store = db.createObjectStore("commands", { keyPath: "commandId" });
        store.createIndex("by-created-at", "createdAt");
        store.createIndex("by-owner-created", ["tenantId", "userId", "createdAt"]);
      } else {
        const store = transaction.objectStore("commands");
        if (!store.indexNames.contains("by-created-at")) store.createIndex("by-created-at", "createdAt");
        if (!store.indexNames.contains("by-owner-created")) {
          store.createIndex("by-owner-created", ["tenantId", "userId", "createdAt"]);
        }
      }
      if (oldVersion < 3) {
        const snapshots = db.createObjectStore("snapshots", { keyPath: "id" });
        snapshots.createIndex("by-owner-updated", ["tenantId", "userId", "updatedAt"]);
      }
    },
  });
  return database;
}

function decodeTokenPayload(token: string): Record<string, unknown> | null {
  try {
    const encoded = token.split(".")[1];
    if (!encoded || typeof window === "undefined") return null;
    const decoded = atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function activeQueueOwner(): QueueOwner | null {
  if (typeof window === "undefined") return null;
  const token = accessToken();
  const payload = token ? decodeTokenPayload(token) : null;
  const tenantId = typeof payload?.tenant_id === "string" ? payload.tenant_id : null;
  const userId = typeof payload?.sub === "string" ? payload.sub : null;
  return tenantId && userId ? { tenantId, userId } : null;
}

function deviceStorageKey(owner: QueueOwner) {
  return `superstore.sync.device_id:${owner.tenantId}:${owner.userId}`;
}

export function currentDeviceId(owner = activeQueueOwner()): string {
  if (!owner || typeof window === "undefined") throw new Error("Sign in before saving work offline.");
  const key = deviceStorageKey(owner);
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const generated = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(key, generated);
  return generated;
}

function normalizeStoredCommand(command: StoredCommand): OfflineCommand {
  const isLegacy = !command.tenantId || !command.userId;
  return {
    commandId: command.commandId,
    deviceId: command.deviceId,
    commandType: command.commandType,
    payload: command.payload,
    createdAt: command.createdAt,
    attempts: command.attempts || 0,
    tenantId: command.tenantId || null,
    userId: command.userId || null,
    status: command.status || (isLegacy ? "blocked" : "pending"),
    lastAttemptAt: command.lastAttemptAt || null,
    lastError: command.lastError || (isLegacy ? LEGACY_COMMAND_MESSAGE : null),
    serverResult: command.serverResult || null,
  };
}

async function allCommands(): Promise<OfflineCommand[]> {
  const db = await getDatabase();
  const stored = await db.getAllFromIndex("commands", "by-created-at") as StoredCommand[];
  const normalized = stored.map(normalizeStoredCommand);
  const legacy = normalized.filter((command) => !command.tenantId || !command.userId);
  if (legacy.length) {
    const tx = db.transaction("commands", "readwrite");
    await Promise.all(legacy.map((command) => tx.store.put(command)));
    await tx.done;
  }
  return normalized;
}

export async function enqueue(command: QueuedCommandInput) {
  const owner = activeQueueOwner();
  if (!owner) throw new Error("Sign in before saving work offline.");
  const db = await getDatabase();
  const record: OfflineCommand = {
    ...command,
    deviceId: currentDeviceId(owner),
    tenantId: owner.tenantId,
    userId: owner.userId,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: "pending",
    lastAttemptAt: null,
    lastError: null,
    serverResult: null,
  };
  await db.put("commands", record);
  notifyQueueChanged();
  return record;
}

export async function pendingCommands(owner = activeQueueOwner()) {
  if (!owner) return [];
  const commands = await allCommands();
  return commands.filter((command) => command.tenantId === owner.tenantId && command.userId === owner.userId);
}

export async function queueSummary(owner = activeQueueOwner()): Promise<QueueSummary> {
  const commands = await allCommands();
  const current = owner
    ? commands.filter((command) => command.tenantId === owner.tenantId && command.userId === owner.userId)
    : [];
  const needsReview = current.filter((command) => ["conflict", "dead_letter"].includes(command.status)).length;
  const blocked = current.filter((command) => command.status === "blocked").length;
  return {
    total: current.length,
    actionable: current.filter((command) => ["pending", "retrying"].includes(command.status)).length,
    needsReview,
    blocked,
    legacy: commands.filter((command) => !command.tenantId || !command.userId).length,
  };
}

export async function removeCommand(commandId: string) {
  await (await getDatabase()).delete("commands", commandId);
  notifyQueueChanged();
}

/**
 * A signed-out browser must not retain work that can reveal a previous
 * tenant's activity.  Queued mutations are intentionally discarded here;
 * staff are warned by the application to synchronize before signing out.
 */
export async function clearOfflineData() {
  const db = await getDatabase();
  const transaction = db.transaction(["commands", "snapshots"], "readwrite");
  await Promise.all([transaction.objectStore("commands").clear(), transaction.objectStore("snapshots").clear()]);
  await transaction.done;
  notifyQueueChanged();
}

function snapshotId(owner: QueueOwner, name: string) {
  return `${owner.tenantId}:${owner.userId}:${name}`;
}

/** Cache a non-sensitive operational read model for the current signed-in user. */
export async function saveOfflineSnapshot(name: string, value: unknown, owner = activeQueueOwner()) {
  if (!owner) return;
  const db = await getDatabase();
  await db.put("snapshots", {
    id: snapshotId(owner, name), tenantId: owner.tenantId, userId: owner.userId, name,
    updatedAt: new Date().toISOString(), value,
  });
}

/** Return only the current user and tenant's last locally saved operational data. */
export async function readOfflineSnapshot<T>(name: string, owner = activeQueueOwner()): Promise<T | null> {
  if (!owner) return null;
  const row = await (await getDatabase()).get("snapshots", snapshotId(owner, name));
  return row?.value as T | undefined || null;
}

async function updateCommand(command: OfflineCommand, changes: Partial<OfflineCommand>) {
  const db = await getDatabase();
  await db.put("commands", { ...command, ...changes });
}

function errorMessage(response: Response) {
  return response.json()
    .then((body: { detail?: string; message?: string }) => body.detail || body.message || `Sync failed (${response.status})`)
    .catch(() => `Sync failed (${response.status})`);
}

async function registerDevice(apiBase: string, owner: QueueOwner) {
  const response = await apiFetch(apiBase, "/api/v1/sync/devices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      device_id: currentDeviceId(owner),
      name: "This web browser",
      platform: "web",
    }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
}

function toWireCommand(command: OfflineCommand) {
  return {
    command_id: command.commandId,
    device_id: command.deviceId,
    command_type: command.commandType,
    payload: command.payload,
  };
}

async function sendCommand(apiBase: string, owner: QueueOwner, command: OfflineCommand): Promise<SyncResult> {
  await updateCommand(command, {
    attempts: command.attempts + 1,
    lastAttemptAt: new Date().toISOString(),
    lastError: null,
  });
  const response = await apiFetch(apiBase, "/api/v1/sync/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenant_id: owner.tenantId, commands: [toWireCommand(command)] }),
  });
  if (!response.ok) {
    const error = await errorMessage(response);
    const permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
    await updateCommand(command, {
      attempts: command.attempts + 1,
      status: permanent ? "blocked" : "retrying",
      lastAttemptAt: new Date().toISOString(),
      lastError: error,
    });
    throw new Error(error);
  }
  const results = await response.json() as Array<{
    command_id: string;
    status: string;
    result?: Record<string, unknown> | null;
    error?: string | null;
  }>;
  const result = results[0];
  if (!result || result.command_id !== command.commandId) {
    throw new Error("The sync server returned an invalid command result.");
  }
  if (["accepted", "duplicate", "failed"].includes(result.status)) {
    await removeCommand(command.commandId);
  } else {
    await updateCommand(command, {
      attempts: command.attempts + 1,
      status: result.status === "pending" ? "retrying" : result.status as OfflineCommandStatus,
      lastAttemptAt: new Date().toISOString(),
      lastError: result.error || null,
      serverResult: result.result || null,
    });
  }
  return {
    commandId: result.command_id,
    status: result.status,
    result: result.result,
    error: result.error,
  };
}

async function flushOwnedQueue(apiBase: string, owner: QueueOwner): Promise<SyncResult[]> {
  const commands = await pendingCommands(owner);
  if (!commands.length) return [];
  await registerDevice(apiBase, owner);
  const results: SyncResult[] = [];
  for (const command of commands) {
    // Commands are sent one at a time and in creation order. A stale stock
    // conflict therefore cannot let a later dependent command leapfrog it.
    if (command.status === "blocked") break;
    const result = await sendCommand(apiBase, owner, command);
    results.push(result);
    if (!["accepted", "duplicate", "failed"].includes(result.status)) break;
  }
  notifyQueueChanged();
  return results;
}

export async function flushQueue(apiBase: string) {
  const owner = activeQueueOwner();
  if (!owner) return [];
  if (!activeFlush) {
    activeFlush = flushOwnedQueue(apiBase, owner).finally(() => {
      activeFlush = undefined;
    });
  }
  return activeFlush;
}

export async function retryBlockedCommands(owner = activeQueueOwner()) {
  if (!owner) return;
  const commands = await pendingCommands(owner);
  const db = await getDatabase();
  const tx = db.transaction("commands", "readwrite");
  await Promise.all(commands.filter((command) => command.status === "blocked").map((command) =>
    tx.store.put({ ...command, status: "retrying", lastError: null }),
  ));
  await tx.done;
  notifyQueueChanged();
}

function notifyQueueChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("superstore:sync-queue"));
}
