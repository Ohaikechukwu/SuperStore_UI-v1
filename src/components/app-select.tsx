"use client";

import { Check, ChevronDown } from "lucide-react";
import { KeyboardEvent, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/ui";

export type AppSelectOption = { value: string; label: string; disabled?: boolean };

type AppSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  name?: string;
  id?: string;
  required?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
};

const maxVisibleOptions = 100;

/**
 * A consistent, accessible single-value dropdown for application forms.
 * Native multi-selects remain native because their interaction is materially
 * different and is better served by the operating system.
 */
export default function AppSelect({
  value, onChange, options, placeholder = "Select an option", disabled = false,
  className, buttonClassName, name, id, required = false, "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy, "aria-invalid": ariaInvalid,
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const selected = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return normalizedQuery ? options.filter((option) => option.label.toLowerCase().includes(normalizedQuery)) : options;
  }, [deferredQuery, options]);
  const visibleOptions = filteredOptions.slice(0, maxVisibleOptions);

  useEffect(() => {
    function dismiss(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, []);

  useEffect(() => {
    if (!open) return;
    function positionMenu() {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const roomBelow = window.innerHeight - rect.bottom;
      const openAbove = roomBelow < 272 && rect.top > roomBelow;
      const maxHeight = Math.max(144, Math.min(256, (openAbove ? rect.top : roomBelow) - 16));
      setMenuPosition({ top: openAbove ? Math.max(8, rect.top - maxHeight - 8) : rect.bottom + 8, left: rect.left, width: rect.width, maxHeight });
    }
    positionMenu();
    window.addEventListener("resize", positionMenu);
    document.addEventListener("scroll", positionMenu, true);
    return () => { window.removeEventListener("resize", positionMenu); document.removeEventListener("scroll", positionMenu, true); };
  }, [open]);

  function choose(option: AppSelectOption) {
    if (option.disabled) return;
    onChange(option.value);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") { setOpen(false); return; }
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpen((current) => !current); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const enabled = filteredOptions.filter((option) => !option.disabled);
    const current = enabled.findIndex((option) => option.value === value);
    const next = event.key === "ArrowDown"
      ? enabled[(current + 1 + enabled.length) % enabled.length]
      : enabled[(current - 1 + enabled.length) % enabled.length];
    if (next) choose(next);
  }

  return <div ref={root} className={cn("relative w-full", className)}>
    {name && <input type="hidden" name={name} value={value} />}
    <button
      ref={trigger}
      id={id}
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      aria-required={required || undefined}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={listId}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={onKeyDown}
      className={cn(
        "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400",
        !selected && "text-slate-400",
        buttonClassName,
      )}
    >
      <span className="min-w-0 flex-1 truncate">{selected?.label || placeholder}</span>
      <ChevronDown size={17} className={cn("shrink-0 text-slate-400 transition-transform", open && "rotate-180 text-teal-600")} />
    </button>
    {open && menuPosition && createPortal(<div ref={menu} id={listId} role="listbox" style={menuPosition} className="fixed z-[100] overflow-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10">
      {options.length > 12 && <div className="sticky top-0 z-10 bg-white p-1.5"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search options" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" /></div>}
      {visibleOptions.map((option) => <button
        type="button"
        role="option"
        aria-selected={option.value === value}
        key={option.value || "__placeholder"}
        disabled={option.disabled}
        onClick={() => choose(option)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition",
          option.value === value ? "bg-teal-50 font-bold text-teal-800" : "text-slate-700 hover:bg-slate-50",
          option.disabled && "cursor-not-allowed opacity-45",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{option.label}</span>
        {option.value === value && <Check size={16} className="shrink-0 text-teal-600" />}
      </button>)}
      {!visibleOptions.length && <p className="px-3 py-4 text-sm text-slate-500">No matching options.</p>}
      {filteredOptions.length > visibleOptions.length && <p className="px-3 py-2 text-xs text-slate-500">Showing the first {maxVisibleOptions} matches. Keep typing to refine the list.</p>}
    </div>, document.body)}
  </div>;
}
