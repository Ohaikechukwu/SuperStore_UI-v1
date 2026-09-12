export type AuditPresentation = {
  action: string;
  entity_type: string;
  entity_id: string;
  actor_id: string | null;
  created_at: string;
  actor?: { id: string | null; name: string; email: string | null; source: string } | null;
  summary?: string;
  description?: string;
  entity_name?: string | null;
  time_zone?: string;
  occurred_at?: string;
  changes?: { field: string; before: unknown; after: unknown }[];
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

export function auditSummary(event: AuditPresentation) {
  if (event.summary) return event.summary;
  // Older API responses still get a readable, explicitly unattributed label.
  const actor = event.actor?.name || (event.actor_id ? "A recorded user" : "An unrecorded actor");
  const data = event.after || event.before;
  const name = event.entity_name || (typeof data?.name === "string" ? data.name : null);
  const kind = event.entity_type.replaceAll("_", " ");
  const suffix = event.action.split(".").slice(1).join(" ").replaceAll("_", " ");
  const action = ({ removed: "deleted", created: "created", updated: "updated", deleted: "deleted", approved: "approved", opened: "opened", closed: "closed" } as Record<string, string>)[suffix];
  const subject = name ? `the ${kind} “${name}”` : `the ${kind} (record ${event.entity_id})`;
  return action ? `${actor} ${action} ${subject}.` : `${actor} performed “${event.action.replaceAll("_", " ").replaceAll(".", ": ")}” on ${subject}.`;
}

export function auditWhen(event: AuditPresentation) {
  const date = new Date(event.created_at);
  if (Number.isNaN(date.getTime())) return "Time not recorded";
  const zone = event.time_zone || "UTC";
  try {
    return `${new Intl.DateTimeFormat("en-GB", { timeZone: zone, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(date)} · ${zone}`;
  } catch {
    return `${date.toISOString()} · UTC`;
  }
}
