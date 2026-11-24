/**
 * Country RulesProfile defaults (spec §42 — decisions D1-D14).
 * Conservative placeholders, not legal advice: every value starts
 * "unconfirmed" until legal / finance confirm it.
 */
export interface Rule {
  key: string;
  label: string;
  value: string;
  confirmed: boolean;
  required?: boolean;
  owner: string;
}
export interface Gate {
  key: string;
  label: string;
  state: "open" | "blocked" | "guardian_only" | "off_default";
  note: string;
  needs: string[]; // rule keys that must be confirmed + approved before the gate can open
}

export const DEFAULT_RULES: Rule[] = [
  { key: "min_age", label: "Account minimum age", value: "18", confirmed: false, owner: "Legal" },
  { key: "student_login", label: "Supervised student login from", value: "13", confirmed: false, owner: "Legal" },
  { key: "background_check", label: "Background check required for", value: "home visit, offline group", confirmed: false, owner: "Legal + Safety" },
  { key: "adult_presence", label: "Home-visit adult presence", value: "Required", confirmed: false, owner: "Legal + Safety" },
  { key: "parent_cancel", label: "Parent cancel: ≥24 h / 12–24 h / <12 h", value: "0% / 50% / 100%", confirmed: false, owner: "Product + Finance" },
  { key: "escrow_window", label: "Escrow dispute window", value: "24 h", confirmed: false, owner: "Finance" },
  { key: "address_retention", label: "Address retention after last session", value: "24 h", confirmed: false, owner: "Legal / DPO" },
  { key: "breadcrumb_retention", label: "Location breadcrumb retention", value: "30 days", confirmed: false, owner: "Legal / DPO" },
  { key: "commission", label: "Platform commission (start tier)", value: "12%", confirmed: false, owner: "Product" },
  { key: "gst", label: "GST on platform fee", value: "18%", confirmed: false, owner: "Finance + CA" },
  { key: "tax_profile", label: "Tax profile (GSTIN, TDS, place of supply)", value: "", confirmed: false, required: true, owner: "Finance + CA" },
  { key: "emergency", label: "Emergency number in SOS flow", value: "112", confirmed: false, owner: "Safety" },
  { key: "recording", label: "Live-class recording", value: "Off by default, consent banner", confirmed: false, owner: "Product + Legal" },
  { key: "dlt", label: "SMS DLT sender + templates registered", value: "", confirmed: false, required: true, owner: "Marketing + Legal" },
];

export const DEFAULT_GATES: Gate[] = [
  { key: "online_tuition", label: "Online 1:1 tuition", state: "open", note: "", needs: [] },
  { key: "home_visits", label: "Home visits", state: "blocked", note: "needs legal approval", needs: ["background_check", "adult_presence", "breadcrumb_retention", "emergency"] },
  { key: "offline_groups", label: "Offline group batches", state: "blocked", note: "", needs: ["background_check"] },
  { key: "minor_accounts", label: "Minor accounts", state: "guardian_only", note: "", needs: ["min_age", "student_login"] },
  { key: "payouts", label: "Payouts", state: "blocked", note: "tax profile missing", needs: ["tax_profile", "gst", "commission"] },
  { key: "recording", label: "Class recording", state: "off_default", note: "", needs: ["recording"] },
];

/** Derives gate states: a gate opens only when its profile is approved and every rule it needs is confirmed and set. */
export function evaluateGates(status: string, rules: Rule[], gates: Gate[]): Gate[] {
  return gates.map((g) => {
    if (!g.needs.length) return g;
    const missing = g.needs.filter((k) => {
      const r = rules.find((x) => x.key === k);
      return !r || !r.value || !r.confirmed;
    });
    if (missing.length) {
      const label = missing.map((k) => rules.find((r) => r.key === k)?.label ?? k)[0];
      const blankRequired = missing.some((k) => !rules.find((r) => r.key === k)?.value);
      return { ...g, state: g.key === "minor_accounts" ? "guardian_only" : g.key === "recording" ? "off_default" : "blocked", note: blankRequired ? `${label.toLowerCase()} missing` : status === "approved" ? `unconfirmed: ${label.toLowerCase()}` : "needs legal approval" };
    }
    if (status !== "approved") return { ...g, state: g.key === "minor_accounts" ? "guardian_only" : g.key === "recording" ? "off_default" : "blocked", note: "needs legal approval" };
    return { ...g, state: g.key === "minor_accounts" ? "guardian_only" : g.key === "recording" ? "off_default" : "open", note: "approved" };
  });
}
