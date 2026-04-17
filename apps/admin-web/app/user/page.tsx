"use client";

import { useEffect, useState } from "react";
import { getMe, User } from "@/lib/api";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";

async function getMonthStats(): Promise<Record<string, any>> {
  const res = await fetchWithRefresh(`${API_BASE_URL}/mobile/me/month-stats`, {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return {};
  return res.json();
}

function StatRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-slate-500">{label}</span>
      <span
        className="text-sm font-semibold"
        style={{ color: color || "#0F172A" }}
      >
        {value}
      </span>
    </div>
  );
}

export default function UserDashboard() {
  const [me, setMe] = useState<User | null>(null);
  const [stats, setStats] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getMe(), getMonthStats()])
      .then(([u, s]) => {
        setMe(u);
        setStats(s);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-32 animate-pulse rounded-3xl bg-white/60" />
        <div className="h-64 animate-pulse rounded-3xl bg-white/60" />
      </div>
    );
  }

  const bal = stats?.overtime_balance as number | null;
  const balLabel = (stats?.overtime_label as string) || "";
  const balPositive = bal != null && bal >= 0;
  const totalH = (stats?.total_hours_credited as number) ?? 0;
  const patientRaw = (stats?.patient_hours_raw as number) ?? 0;
  const otherRaw = (stats?.other_hours_raw as number) ?? 0;
  const holidayH = (stats?.holiday_hours as number) ?? 0;
  const vacH = (stats?.vacation_hours as number) ?? 0;
  const avg = (stats?.avg_per_workday as number) ?? 0;
  const proj = (stats?.month_projection as number) ?? 0;
  const tgt = stats?.target_hours_per_day as number | null;
  const monthName = (stats?.month_name as string) || "";
  const wdElapsed = (stats?.workdays_elapsed as number) ?? 0;
  const wdTotal = (stats?.workdays_total as number) ?? 0;
  const isHoliday = stats?.today_is_holiday === true;
  const holidayName = stats?.today_holiday_name as string | null;
  const isVacation = stats?.today_is_vacation === true;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur sm:rounded-3xl sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Hallo {me?.full_name?.split(" ")[0] ?? ""} 👋
        </h1>
        <p className="mt-1 text-xs text-slate-600 sm:text-sm">
          {me?.email}
        </p>
      </div>

      {isVacation && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          🏖️ Heute ist dein Urlaubstag — genieß die freie Zeit! Dein
          Tagessoll ({tgt?.toFixed(1) ?? "–"} h) wird automatisch
          angerechnet.
        </div>
      )}
      {isHoliday && holidayName && (
        <div className="flex items-center gap-3 rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-800">
          🎉 Heute ist {holidayName} — genieß den freien Tag! Dein
          Tagessoll ({tgt?.toFixed(1) ?? "–"} h) wird automatisch
          angerechnet.
        </div>
      )}

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Saldo */}
        {bal != null && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:text-xs">
              {balLabel}
            </p>
            <p
              className="mt-1 text-3xl font-bold sm:mt-2 sm:text-4xl"
              style={{ color: balPositive ? "#059669" : "#DC2626" }}
            >
              {balPositive ? "+" : ""}
              {bal.toFixed(1)} h
            </p>
          </div>
        )}

        {/* Monatsstatistik */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:text-xs">
            {monthName} · Tag {wdElapsed}/{wdTotal}
          </p>
          <div className="mt-4 divide-y divide-slate-100">
            <StatRow
              label="Betreuung"
              value={`${patientRaw.toFixed(1)} h + 10% = ${(patientRaw * 1.1).toFixed(1)} h`}
            />
            {otherRaw > 0 && (
              <StatRow label="Sonstige" value={`${otherRaw.toFixed(1)} h`} />
            )}
            {holidayH > 0 && (
              <StatRow
                label="Feiertage"
                value={`${holidayH.toFixed(1)} h`}
                color="#7C3AED"
              />
            )}
            {vacH > 0 && (
              <StatRow
                label="Urlaub"
                value={`${vacH.toFixed(1)} h`}
                color="#D97706"
              />
            )}
            <StatRow
              label="Gesamt bisher"
              value={`${totalH.toFixed(1)} h`}
            />
            {tgt != null && (
              <StatRow label="Soll / Tag" value={`${tgt.toFixed(1)} h`} />
            )}
            <StatRow label="Ø pro Arbeitstag" value={`${avg.toFixed(1)} h`} />
            <div className="pt-2">
              <StatRow
                label="Monatsprognose"
                value={`${proj.toFixed(0)} h`}
                color="#2563EB"
              />
              <p className="text-right text-[10px] text-slate-400">
                (Ø {avg.toFixed(1)} h/Tag × 5 × 4,33)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
