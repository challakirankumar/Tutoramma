"use client";

import { useEffect, useMemo, useState } from "react";
import { GraduationCap, Search, ShieldCheck, ShieldOff, UserCog, Users as UsersIcon } from "lucide-react";

import { AvatarTile } from "@/components/shared/AvatarTile";
import { StatusPill } from "@/components/shared/StatusPill";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAppStore } from "@/stores/app-store";
import { dateOf } from "@/lib/format";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  isDemo: boolean;
  createdAt: string;
  color: string;
  city: string;
}

const ROLE_CARDS: { role: string; label: string; icon: typeof UsersIcon; tone: "navy" | "green" | "orange" | "red" }[] = [
  { role: "student", label: "Students", icon: GraduationCap, tone: "orange" },
  { role: "parent", label: "Parents", icon: UsersIcon, tone: "green" },
  { role: "tutor", label: "Tutors", icon: UserCog, tone: "navy" },
  { role: "admin", label: "Admins", icon: ShieldCheck, tone: "red" },
];

const ROLE_PILL: Record<string, { label: string; cls: "orange" | "green" | "navy" | "red" }> = {
  student: { label: "Student", cls: "orange" },
  parent: { label: "Parent", cls: "green" },
  tutor: { label: "Tutor", cls: "navy" },
  admin: { label: "Admin", cls: "red" },
  institute: { label: "Institute", cls: "green" },
};

export function AUsers() {
  const me = useAppStore((s) => s.user);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState<UserRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/users")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message || "Failed to load users.");
        return json.data as { users: UserRow[]; counts: Record<string, number> };
      })
      .then((d) => {
        setUsers(d.users);
        setCounts(d.counts);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load users."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.includes(q));
  }, [users, query]);

  const submitStatus = async () => {
    if (!confirm) return;
    const action = confirm.status === "suspended" ? "activate" : "suspend";
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${confirm.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Action failed.");
      const newStatus = action === "suspend" ? "suspended" : "active";
      setUsers((list) => list.map((u) => (u.id === confirm.id ? { ...u, status: newStatus } : u)));
      toast({
        title: action === "suspend" ? `${confirm.name} suspended` : `${confirm.name} reactivated`,
        description: action === "suspend" ? "The account can no longer sign in. Logged to the audit trail." : "Account access restored.",
      });
      setConfirm(null);
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingView label="Loading users…" />;
  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState icon={ShieldOff} title="Users unavailable" sub={error} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Users & Access</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {users.length} accounts · {users.filter((u) => u.status === "suspended").length} suspended · suspensions block sign-in instantly.
          </p>
        </div>
      </div>

      {/* role summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {ROLE_CARDS.map((c) => (
          <div key={c.role} className="sk-card p-4 flex items-center gap-3.5">
            <div
              className="sk-avatar shrink-0 text-white"
              style={{
                width: 42,
                height: 42,
                borderRadius: 13,
                background:
                  c.tone === "navy"
                    ? "linear-gradient(180deg,#33549E,#14246B)"
                    : c.tone === "orange"
                      ? "linear-gradient(180deg,#FFA24D,#E76E0F)"
                      : c.tone === "green"
                        ? "linear-gradient(180deg,#46BD85,#1F9D68)"
                        : "linear-gradient(180deg,#E96A75,#C03342)",
              }}
            >
              <c.icon className="w-[19px] h-[19px]" strokeWidth={2.1} />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</div>
              <div className="text-[19px] font-bold leading-tight mt-0.5 tabular">{counts[c.role] ?? 0}</div>
            </div>
          </div>
        ))}
      </div>

      {/* search */}
      <div className="sk-card p-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="sk-input w-full pl-9"
            placeholder="Search by name, email or role…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search users"
          />
        </div>
      </div>

      {/* users table */}
      {filtered.length === 0 ? (
        <div className="sk-card p-6">
          <EmptyState icon={UsersIcon} title="No users match" sub="Try a different search." />
        </div>
      ) : (
        <div className="sk-card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-[#F5F7FC] dark:bg-transparent text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">User</th>
                  <th className="px-3 py-2.5 font-semibold">Role</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Joined</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Access</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const role = ROLE_PILL[u.role] ?? { label: u.role, cls: "grey" as const };
                  const suspended = u.status === "suspended";
                  return (
                    <tr key={u.id} className="border-t">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <AvatarTile name={u.name} color={u.color} size={30} />
                          <div className="min-w-0">
                            <div className="font-semibold truncate max-w-[160px]">{u.name}</div>
                            <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">{u.email}</div>
                          </div>
                          {u.isDemo && (
                            <StatusPill tone="grey" dot={false}>
                              demo
                            </StatusPill>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusPill tone={role.cls}>{role.label}</StatusPill>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusPill tone={suspended ? "red" : "green"}>{suspended ? "Suspended" : "Active"}</StatusPill>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{dateOf(u.createdAt)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {u.id === me?.id ? (
                          <span className="text-[11px] text-muted-foreground" title="This is you">
                            You
                          </span>
                        ) : (
                          <button
                            className={`sk-btn sk-btn-sm ${suspended ? "sk-btn-success" : "sk-btn-danger"}`}
                            onClick={() => setConfirm(u)}
                          >
                            {suspended ? "Activate" : "Suspend"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* confirm dialog */}
      <Dialog open={!!confirm} onOpenChange={(o) => !busy && setConfirm(o ? confirm : null)}>
        <DialogContent className="sm:max-w-sm">
          {confirm && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {confirm.status === "suspended" ? `Reactivate ${confirm.name}?` : `Suspend ${confirm.name}?`}
                </DialogTitle>
                <DialogDescription>
                  {confirm.status === "suspended"
                    ? "The account will be able to sign in and use the platform again immediately."
                    : "The account will be blocked from signing in instantly. Existing bookings stay on record. The user is notified."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <button className="sk-btn sk-btn-ghost sk-btn-sm" disabled={busy} onClick={() => setConfirm(null)}>
                  Cancel
                </button>
                <button
                  className={`sk-btn sk-btn-sm ${confirm.status === "suspended" ? "sk-btn-success" : "sk-btn-danger"}`}
                  disabled={busy}
                  onClick={submitStatus}
                >
                  {busy ? "Saving…" : confirm.status === "suspended" ? "Confirm reactivation" : "Confirm suspension"}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
