/** Formatting + state-mapping helpers shared by every view. */

export const CURRENCY = "INR";

/** Minor-unit (paise) amount → "1,23,456.50" (Indian digit grouping). */
export function paise(n: number, decimals = 2): string {
  return (n / 100).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
/** Minor-unit (paise) amount → "₹1,23,456.50". */
export function inr(n: number, decimals = 2): string {
  return `₹${paise(n, decimals)}`;
}
/** Legacy aliases from the KWD era — same behaviour, kept so older call-sites keep working. */
export const fils = paise;
export const kwd = inr;

export function timeOf(d: string | Date): string {
  return new Date(d).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}
export function dateOf(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
export function dateTimeOf(d: string | Date): string {
  return `${dateOf(d)} · ${timeOf(d)}`;
}
export function fromNow(d: string | Date): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return dateOf(d);
}
export function untilLabel(d: string | Date): string {
  const diff = new Date(d).getTime() - Date.now();
  const mins = Math.round(diff / 60000);
  if (mins < -60) return `${Math.round(-mins / 60)}h ago`;
  if (mins < 0) return `${-mins}m ago`;
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  return `in ${Math.round(hrs / 24)}d`;
}

/* ---------- status pill mappings ---------- */
type PillClass = "green" | "orange" | "red" | "blue" | "grey" | "navy";

export const BOOKING_STATE_PILL: Record<string, { label: string; cls: PillClass }> = {
  requested: { label: "Requested", cls: "orange" },
  accepted: { label: "Accepted", cls: "blue" },
  in_progress: { label: "In progress", cls: "navy" },
  completed: { label: "Completed", cls: "green" },
  released: { label: "Released", cls: "green" },
  cancelled: { label: "Cancelled", cls: "grey" },
  declined: { label: "Declined", cls: "red" },
  no_show: { label: "No show", cls: "red" },
  disputed: { label: "Disputed", cls: "red" },
  refunded: { label: "Refunded", cls: "grey" },
};

export const PAYMENT_STATE_PILL: Record<string, { label: string; cls: PillClass }> = {
  created: { label: "Created", cls: "grey" },
  pending: { label: "Pending", cls: "orange" },
  held: { label: "In escrow", cls: "blue" },
  authorised: { label: "Authorised", cls: "blue" },
  released: { label: "Released", cls: "green" },
  succeeded: { label: "Paid", cls: "green" },
  failed: { label: "Failed", cls: "red" },
  refund_pending: { label: "Refund pending", cls: "orange" },
  refunded: { label: "Refunded", cls: "grey" },
};

export const TUTOR_STATUS_PILL: Record<string, { label: string; cls: PillClass }> = {
  draft: { label: "Draft", cls: "grey" },
  submitted: { label: "Submitted", cls: "orange" },
  in_review: { label: "In review", cls: "orange" },
  needs_info: { label: "Needs info", cls: "red" },
  approved: { label: "Approved", cls: "green" },
  rejected: { label: "Rejected", cls: "red" },
};

export const STAGE_PILL: Record<string, { label: string; cls: PillClass }> = {
  scheduled: { label: "Scheduled", cls: "grey" },
  enroute: { label: "On the way", cls: "orange" },
  arrived: { label: "Arrived", cls: "blue" },
  in_progress: { label: "Session live", cls: "navy" },
  done: { label: "Done", cls: "green" },
};

export const MODE_LABEL: Record<string, string> = {
  online: "Online 1:1",
  home: "Home visit",
  group: "Group class",
  venue: "Venue group",
};

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Masks phone numbers & emails in chat bodies (anti-leakage rule). */
export function maskSensitive(text: string): string {
  return text
    .replace(/(\+?91[\s-]?)?\d{5}[\s-]?\d{5}/g, "••••• ••••• (masked)")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "••••@•••• (masked)");
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function minutesToLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}
