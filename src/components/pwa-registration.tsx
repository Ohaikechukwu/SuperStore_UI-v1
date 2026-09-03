"use client";

import { useEffect } from "react";

const SERVICE_WORKER_REVISION = "2026-09-03-2";

/** Registers the offline shell only in deployable browser contexts. */
export default function PwaRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;
    void navigator.serviceWorker
      .register(`/sw.js?v=${SERVICE_WORKER_REVISION}`, { scope: "/", updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => undefined);
  }, []);

  return null;
}
