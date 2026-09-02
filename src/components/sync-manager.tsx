"use client";

import { useCallback, useEffect } from "react";
import { apiFetch } from "@/auth";
import { API_BASE } from "@/lib/config";
import { apiIsReachable } from "@/lib/connectivity";
import { activeQueueOwner, flushQueue, queueSummary, type QueueSummary } from "@/offlineQueue";

export type SyncState = {
  phase: "offline" | "idle" | "syncing" | "pending" | "review" | "blocked";
  summary: QueueSummary;
  error: string | null;
};

const emptySummary: QueueSummary = {
  total: 0,
  actionable: 0,
  needsReview: 0,
  blocked: 0,
  legacy: 0,
};

function liveVersionKey(tenantId: string, userId: string) {
  return `superstore.sync.live_version:${tenantId}:${userId}`;
}

export default function SyncManager({ onStateChange }: { onStateChange: (state: SyncState) => void }) {
  const pollLiveVersion = useCallback(async () => {
    if (!await apiIsReachable()) return;
    const owner = activeQueueOwner();
    if (!owner) return;
    const response = await apiFetch(
      API_BASE,
      `/api/v1/sync/version?tenant_id=${encodeURIComponent(owner.tenantId)}`,
    ).catch(() => null);
    if (!response?.ok) return;
    const body = await response.json() as { cursor: string | null };
    if (!body.cursor) return;
    const key = liveVersionKey(owner.tenantId, owner.userId);
    const previous = window.sessionStorage.getItem(key);
    window.sessionStorage.setItem(key, body.cursor);
    if (previous && previous !== body.cursor) {
      window.dispatchEvent(new CustomEvent("superstore:live-change"));
    }
  }, []);

  const refresh = useCallback(async () => {
    const summary = await queueSummary();
    if (!await apiIsReachable()) {
      onStateChange({ phase: "offline", summary, error: null });
      return;
    }
    if (summary.needsReview) {
      onStateChange({ phase: "review", summary, error: null });
      return;
    }
    if (summary.blocked || summary.legacy) {
      onStateChange({ phase: "blocked", summary, error: null });
      return;
    }
    onStateChange({ phase: summary.total ? "pending" : "idle", summary, error: null });
  }, [onStateChange]);

  const synchronize = useCallback(async () => {
    const before = await queueSummary();
    if (!await apiIsReachable()) {
      onStateChange({ phase: "offline", summary: before, error: null });
      return;
    }
    if (!before.total || before.needsReview || before.blocked || before.legacy) {
      // Reachability was just confirmed above. Rechecking it here doubled the
      // background health traffic for every open tab.
      if (before.needsReview) onStateChange({ phase: "review", summary: before, error: null });
      else if (before.blocked || before.legacy) onStateChange({ phase: "blocked", summary: before, error: null });
      else onStateChange({ phase: "idle", summary: before, error: null });
      return;
    }
    onStateChange({ phase: "syncing", summary: before, error: null });
    try {
      const results = await flushQueue(API_BASE);
      const summary = await queueSummary();
      window.dispatchEvent(new CustomEvent("superstore:sync-complete", { detail: results }));
      await pollLiveVersion();
      if (summary.needsReview) onStateChange({ phase: "review", summary, error: null });
      else onStateChange({ phase: summary.total ? "pending" : "idle", summary, error: null });
    } catch (caught) {
      const summary = await queueSummary();
      const reachable = await apiIsReachable();
      onStateChange({
        phase: !reachable ? "offline" : summary.blocked ? "blocked" : "pending",
        summary,
        error: caught instanceof Error ? caught.message : "Unable to synchronize queued work.",
      });
    }
  }, [onStateChange, pollLiveVersion, refresh]);

  useEffect(() => {
    let active = true;
    const pageIsVisible = () => document.visibilityState === "visible";
    const safelySynchronize = () => { if (active && pageIsVisible()) void synchronize(); };
    safelySynchronize();
    if (pageIsVisible()) void pollLiveVersion();
    const timer = window.setInterval(safelySynchronize, 30_000);
    const liveTimer = window.setInterval(() => { if (active && pageIsVisible()) void pollLiveVersion(); }, 30_000);
    const handleOffline = () => { if (active && pageIsVisible()) void refresh(); };
    window.addEventListener("online", safelySynchronize);
    window.addEventListener("superstore:sync-queue", safelySynchronize);
    window.addEventListener("visibilitychange", safelySynchronize);
    window.addEventListener("offline", handleOffline);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.clearInterval(liveTimer);
      window.removeEventListener("online", safelySynchronize);
      window.removeEventListener("superstore:sync-queue", safelySynchronize);
      window.removeEventListener("visibilitychange", safelySynchronize);
      window.removeEventListener("offline", handleOffline);
    };
  }, [pollLiveVersion, refresh, synchronize]);

  return null;
}

export { emptySummary };
