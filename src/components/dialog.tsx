"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/ui";

/** Mount conditionally. Native modality traps focus and makes the background inert. */
export default function Dialog({ title, children, onClose, busy = false, className }: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return <dialog ref={ref} aria-label={title} aria-busy={busy || undefined}
    className={cn("app-dialog", className || "max-w-2xl")}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    {children}
  </dialog>;
}
