"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE, apiRequestHeaders } from "@/lib/config";

export const CONNECTIVITY_EVENT = "superstore:api-connectivity";
const CHECK_INTERVAL_MS = 10_000;
const CHECK_TIMEOUT_MS = 4_000;
let reachabilityInFlight: Promise<boolean> | null = null;
let lastReportedReachability: boolean | null = null;

export function reportApiReachability(online: boolean) {
  if (typeof window === "undefined") return;
  if (lastReportedReachability === online) return;
  lastReportedReachability = online;
  window.dispatchEvent(new CustomEvent<boolean>(CONNECTIVITY_EVENT, { detail: online }));
}

/**
 * Browser online/offline events only describe a network interface. Confirm the
 * actual API is available before calling the workspace live.
 */
export async function apiIsReachable() {
  if (typeof window === "undefined" || !navigator.onLine) {
    reportApiReachability(false);
    return false;
  }
  if (reachabilityInFlight) return reachabilityInFlight;
  const check = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE}/health/ready`, {
        cache: "no-store",
        headers: apiRequestHeaders(API_BASE),
        signal: controller.signal,
      });
      if (!response.ok) {
        reportApiReachability(false);
        return false;
      }
      const syncStatus = await fetch(`${API_BASE}/api/v1/edge/status`, {
        cache: "no-store", headers: apiRequestHeaders(API_BASE), signal: controller.signal,
      })
        .then(async (item) => item.ok ? item.json() as Promise<{ cloud?: string }> : null)
        .catch(() => null);
      const online = syncStatus?.cloud !== "offline";
      reportApiReachability(online);
      return online;
    } catch {
      reportApiReachability(false);
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  })();
  reachabilityInFlight = check;
  try {
    return await check;
  } finally {
    if (reachabilityInFlight === check) reachabilityInFlight = null;
  }
}

/** A request that did not receive a server response can safely be queued. */
export function isConnectionFailure(error: unknown) {
  if (error instanceof TypeError) return true;
  return error instanceof DOMException && error.name === "AbortError";
}

export function useApiConnectivity(intervalMs = CHECK_INTERVAL_MS) {
  const [online, setOnline] = useState(true);
  const refresh = useCallback(async () => {
    const next = await apiIsReachable();
    setOnline(next);
    return next;
  }, []);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const initialCheck = window.setTimeout(refreshWhenVisible, 0);
    const timer = window.setInterval(refreshWhenVisible, intervalMs);
    const handleBrowserChange = refreshWhenVisible;
    const handleReachability = (event: Event) => setOnline((event as CustomEvent<boolean>).detail);
    window.addEventListener("online", handleBrowserChange);
    window.addEventListener("offline", handleBrowserChange);
    window.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener(CONNECTIVITY_EVENT, handleReachability);
    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(timer);
      window.removeEventListener("online", handleBrowserChange);
      window.removeEventListener("offline", handleBrowserChange);
      window.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener(CONNECTIVITY_EVENT, handleReachability);
    };
  }, [intervalMs, refresh]);

  return { online, refresh };
}
