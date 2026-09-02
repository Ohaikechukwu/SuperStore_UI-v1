"use client";

import { useEffect, useRef } from "react";

import { accessToken, refreshSession } from "@/auth";
import { API_BASE } from "@/lib/config";

export type RealtimeEvent = { type: string; [key: string]: unknown };

function parseEvent(block: string): RealtimeEvent | null {
  const data = block.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
  if (!data) return null;
  try {
    const event = JSON.parse(data) as unknown;
    return typeof event === "object" && event !== null && typeof (event as { type?: unknown }).type === "string"
      ? event as RealtimeEvent : null;
  } catch {
    return null;
  }
}

/**
 * Authenticated Server-Sent Events. Fetch is used instead of EventSource so
 * the short-lived bearer token never needs to be placed in a URL.
 */
export function useRealtimeEvents(onEvent: (event: RealtimeEvent) => void, enabled = true) {
  const callback = useRef(onEvent);
  useEffect(() => { callback.current = onEvent; }, [onEvent]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let retryDelay = 1000;
    let retryTimer: number | undefined;
    let active = true;

    const waitToRetry = () => new Promise<void>((resolve) => {
      retryTimer = window.setTimeout(resolve, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 15_000);
    });

    const connect = async () => {
      while (active) {
        try {
          if (!accessToken()) await refreshSession(API_BASE);
          const token = accessToken();
          if (!token) throw new Error("no active session");
          const response = await fetch(`${API_BASE}/api/v1/hospital/events/stream`, {
            headers: { authorization: `Bearer ${token}`, accept: "text/event-stream" },
            credentials: "include", cache: "no-store", signal: controller.signal,
          });
          if (!response.ok || !response.body) throw new Error(`live events unavailable (${response.status})`);
          retryDelay = 1000;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (active) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split("\n\n");
            buffer = blocks.pop() || "";
            for (const block of blocks) {
              const event = parseEvent(block);
              if (event) callback.current(event);
            }
          }
        } catch (error) {
          if (controller.signal.aborted) return;
        }
        if (active) await waitToRetry();
      }
    };

    void connect();
    return () => {
      active = false;
      controller.abort();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [enabled]);
}
