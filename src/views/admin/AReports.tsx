"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FileDown, Printer, ShieldQuestion, Trophy } from "lucide-react";

import { AvatarTile } from "@/components/shared/AvatarTile";
import { StatusPill } from "@/components/shared/StatusPill";
import { EmptyState, LoadingView, SectionTitle } from "@/components/shared/Section";
import { toast } from "@/hooks/use-toast";
import { MODE_LABEL, kwd } from "@/lib/format";
import { pdfAdminReport, downloadCsv } from "@/lib/pdf";

interface ReportsData {
  gmvWeekly: { label: string; value: number }[];
  modeSplit: { mode: string; count: number }[];
  topTutors: { name: string; color: string; sessions: number; rating: number; trustScore: number }[];
  studentsByBoard: { board: string; count: number }[];
  revenueSplit: { platform: number; tutors: number };
  avgSessionPrice: number;
  totalBookings: number;
}

const NAVY = "#14246B";
const ROYAL = "#315BE5";
const ORANGE = "#F47B20";
const GREEN = "#1F9D68";
const MODE_COLORS: Record<string, string> = { online: NAVY, home: ORANGE, group: GREEN, venue: GREEN };

/** Paise → compact ₹ chart-axis label (₹XL for lakhs, ₹XK for thousands). */
function gmvAxisLabel(v: number): string {
  const rupees = v / 100;
  if (rupees >= 100000) return `₹${Math.round(rupees / 100000)}L`;
  if (rupees >= 1000) return `₹${Math.round(rupees / 1000)}K`;
  return `₹${Math.round(rupees)}`;
}

export function AReports() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/reports")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message || "Failed to load reports.");
        return json.data as ReportsData;
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load reports."));
  }, []);

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState icon={ShieldQuestion} title="Reports unavailable" sub={error} />
      </div>
    );
  }
  if (!data) return <LoadingView label="Crunching marketplace numbers…" />;

  const modeData = data.modeSplit.map((m) => ({ name: MODE_LABEL[m.mode] ?? m.mode, value: m.count, mode: m.mode }));
  const splitData = [
    { name: "Platform commission", value: data.revenueSplit.platform, fill: NAVY },
    { name: "Tutor earnings", value: data.revenueSplit.tutors, fill: ORANGE },
  ];
  const gmvTotal = data.gmvWeekly.reduce((s, w) => s + w.value, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Marketplace Reports</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            GMV, revenue split and adoption across the Tutor Amma marketplace.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="sk-btn sk-btn-primary sk-btn-sm"
            onClick={async () => {
              try {
                await pdfAdminReport({
                  title: "Marketplace Report",
                  periodLabel: "Last 8 weeks",
                  kpis: [
                    { label: "GMV · last 8 weeks", value: kwd(gmvTotal, 0) },
                    { label: "Total bookings", value: data.totalBookings.toLocaleString() },
                    { label: "Average session price", value: kwd(data.avgSessionPrice, 2) },
                    { label: "Platform revenue", value: kwd(data.revenueSplit.platform) },
                    { label: "Tutor earnings", value: kwd(data.revenueSplit.tutors) },
                  ],
                  sections: [
                    {
                      heading: "GMV — weekly",
                      head: ["Week", "GMV"],
                      rows: data.gmvWeekly.map((w) => [w.label, kwd(w.value)]),
                    },
                    {
                      heading: "Bookings by mode",
                      head: ["Mode", "Bookings"],
                      rows: data.modeSplit.map((m) => [MODE_LABEL[m.mode] ?? m.mode, m.count]),
                    },
                    {
                      heading: "Active students by board",
                      head: ["Board", "Students"],
                      rows: data.studentsByBoard.map((b) => [b.board, b.count]),
                    },
                    {
                      heading: "Top tutors",
                      head: ["Tutor", "Completed sessions", "Rating", "Trust score"],
                      rows: data.topTutors.map((t) => [t.name, t.sessions, t.rating.toFixed(1), t.trustScore]),
                    },
                  ],
                });
                toast({ title: "Report PDF downloaded", description: "Branded A4 PDF with the Tutor Amma letterhead." });
              } catch {
                toast({ title: "Could not build the PDF", variant: "destructive" });
              }
            }}
          >
            <Printer className="w-3.5 h-3.5" /> Export PDF
          </button>
          <button
            className="sk-btn sk-btn-ghost sk-btn-sm"
            onClick={() => {
              downloadCsv(
                "TutorAmma_Marketplace_Report",
                ["Section", "Item", "Value"],
                [
                  ...data.gmvWeekly.map((w) => ["GMV weekly", w.label, kwd(w.value)]),
                  ...data.modeSplit.map((m) => ["Bookings by mode", MODE_LABEL[m.mode] ?? m.mode, m.count]),
                  ...data.studentsByBoard.map((b) => ["Students by board", b.board, b.count]),
                  ...data.topTutors.map((t) => ["Top tutors", t.name, `${t.sessions} sessions · ★${t.rating.toFixed(1)} · trust ${t.trustScore}`]),
                ]
              );
              toast({ title: "CSV exported", description: "Opens directly in Excel or Google Sheets." });
            }}
          >
            <FileDown className="w-3.5 h-3.5" /> Excel (CSV)
          </button>
        </div>
      </div>

      {/* headline stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "GMV · last 8 weeks", value: kwd(gmvTotal, 0) },
          { label: "Total bookings", value: data.totalBookings.toLocaleString() },
          { label: "Avg session price", value: kwd(data.avgSessionPrice, 2) },
          { label: "Platform revenue", value: kwd(data.revenueSplit.platform) },
          { label: "Tutor earnings", value: kwd(data.revenueSplit.tutors) },
        ].map((c) => (
          <div key={c.label} className="sk-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</div>
            <div className="text-[19px] font-extrabold tabular mt-1">{c.value}</div>
          </div>
        ))}
      </div>

      {/* charts grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="sk-card p-4">
          <SectionTitle title="GMV — weekly" sub="Escrow + released payments, last 8 weeks" />
          <div className="h-[220px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.gmvWeekly} margin={{ top: 6, right: 4, left: -8, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10.5 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10.5 }} axisLine={false} tickLine={false} tickFormatter={(v) => gmvAxisLabel(Number(v))} />
                <Tooltip formatter={(v) => [kwd(Number(v)), "GMV"]} />
                <Bar dataKey="value" fill={NAVY} radius={[6, 6, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="sk-card p-4">
          <SectionTitle title="Revenue split" sub="From released payments" />
          <div className="h-[180px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={splitData} dataKey="value" nameKey="name" innerRadius={46} outerRadius={72} paddingAngle={3}>
                  {splitData.map((s) => (
                    <Cell key={s.name} fill={s.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, name) => [kwd(Number(v)), String(name)]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
            {splitData.map((s) => (
              <span key={s.name} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <span className="w-2 h-2 rounded-full" style={{ background: s.fill }} />
                {s.name} · {kwd(s.value, 1)}
              </span>
            ))}
          </div>
        </div>

        <div className="sk-card p-4">
          <SectionTitle title="Bookings by mode" sub="All-time counts" />
          <div className="h-[180px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={modeData} dataKey="value" nameKey="name" innerRadius={46} outerRadius={72} paddingAngle={3}>
                  {modeData.map((m) => (
                    <Cell key={m.mode} fill={MODE_COLORS[m.mode] ?? ROYAL} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, name) => [`${v} bookings`, String(name)]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
            {modeData.map((m) => (
              <span key={m.mode} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <span className="w-2 h-2 rounded-full" style={{ background: MODE_COLORS[m.mode] ?? ROYAL }} />
                {m.name} · {m.value}
              </span>
            ))}
          </div>
        </div>

        <div className="sk-card p-4">
          <SectionTitle title="Active students by board" sub="Student profiles per curriculum board" />
          <div className="h-[220px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.studentsByBoard} layout="vertical" margin={{ top: 4, right: 12, left: 10, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10.5 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="board" tick={{ fontSize: 10.5 }} axisLine={false} tickLine={false} width={70} />
                <Tooltip formatter={(v) => [`${v} students`, "Enrolled"]} />
                <Bar dataKey="count" fill={ROYAL} radius={[0, 6, 6, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* top tutors */}
      <div className="sk-card p-4">
        <SectionTitle title="Top tutors" sub="By completed + released sessions" />
        {data.topTutors.length === 0 ? (
          <div className="text-[12.5px] text-muted-foreground py-4">No completed sessions yet.</div>
        ) : (
          <div className="mt-3 rounded-2xl border overflow-hidden overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-[#F5F7FC] dark:bg-transparent text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">Tutor</th>
                  <th className="px-3 py-2 font-semibold text-right">Completed sessions</th>
                  <th className="px-3 py-2 font-semibold text-right">Rating</th>
                  <th className="px-4 py-2 font-semibold text-right">Trust score</th>
                </tr>
              </thead>
              <tbody>
                {data.topTutors.map((t, i) => (
                  <tr key={t.name} className="border-t">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="relative">
                          <AvatarTile name={t.name} color={t.color} size={30} />
                          {i === 0 && (
                            <span className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 rounded-full bg-[#F47B20] text-white flex items-center justify-center">
                              <Trophy className="w-2.5 h-2.5" />
                            </span>
                          )}
                        </span>
                        <span className="font-semibold">{t.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold tabular">{t.sessions}</td>
                    <td className="px-3 py-2.5 text-right">
                      <StatusPill tone="green">★ {t.rating.toFixed(1)}</StatusPill>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <StatusPill tone={t.trustScore >= 85 ? "green" : "blue"}>{t.trustScore}</StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
