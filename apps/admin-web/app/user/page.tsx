"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMe, User } from "@/lib/api";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";

const QUOTES = [
  "Jede Minute deiner Arbeit macht den Tag eines Menschen heller.",
  "Kleine Gesten, große Wirkung — du machst das großartig!",
  "Heute ist ein guter Tag um etwas Gutes zu tun.",
  "Du bist das Lächeln im Alltag von jemandem.",
  "Pflege ist Liebe in Arbeitskleidung.",
  "Manchmal ist ein Gespräch die beste Medizin.",
  "Wer anderen hilft, wächst mit jeder Stunde.",
  "Ein Spaziergang mit dir ist oft das Highlight des Tages.",
];

async function getMonthStats(): Promise<Record<string, any>> {
  const res = await fetchWithRefresh(`${API_BASE_URL}/mobile/me/month-stats`, {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return {};
  return res.json();
}

async function getOrgContact(): Promise<Record<string, any>> {
  const res = await fetchWithRefresh(`${API_BASE_URL}/mobile/org-contact`, {
    headers: buildHeaders(),
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
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-slate-500 sm:text-sm">{label}</span>
      <span
        className="text-xs font-semibold sm:text-sm"
        style={{ color: color || "#0F172A" }}
      >
        {value}
      </span>
    </div>
  );
}

function ActionTile({
  href,
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
}: {
  href: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-slate-300 hover:shadow-sm sm:p-4"
    >
      <div
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg sm:h-12 sm:w-12"
        style={{ background: iconBg, color: iconColor }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      <span className="text-slate-400">›</span>
    </Link>
  );
}

export default function UserDashboard() {
  const [me, setMe] = useState<User | null>(null);
  const [stats, setStats] = useState<Record<string, any> | null>(null);
  const [contact, setContact] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getMe(), getMonthStats(), getOrgContact()])
      .then(([u, s, c]) => {
        setMe(u);
        setStats(s);
        setContact(c);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-2xl bg-white/60" />
        <div className="h-48 animate-pulse rounded-2xl bg-white/60" />
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
  const quote = QUOTES[new Date().getDate() % QUOTES.length];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-4 text-white shadow-md sm:rounded-3xl sm:p-6">
        <p className="text-xs font-medium text-white/70 sm:text-sm">
          Hallo {me?.full_name?.split(" ")[0] ?? ""} 👋
        </p>
        <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-3xl">
          FrohZeit Aktuell
        </h1>
        <div className="mt-3 flex items-center gap-4 sm:mt-4 sm:gap-8">
          <div>
            <p className="text-2xl font-bold sm:text-3xl">{totalH.toFixed(1)} h</p>
            <p className="text-[10px] text-white/70 sm:text-xs">Monat h (inkl. 10%)</p>
          </div>
          <div className="h-8 w-px bg-white/30" />
          <div>
            <p className="text-2xl font-bold sm:text-3xl">{avg.toFixed(1)} h</p>
            <p className="text-[10px] text-white/70 sm:text-xs">Ø / Tag</p>
          </div>
          {bal != null && (
            <>
              <div className="h-8 w-px bg-white/30" />
              <div>
                <p className="text-2xl font-bold sm:text-3xl">
                  {balPositive ? "+" : ""}{bal.toFixed(0)}
                </p>
                <p className="text-[10px] text-white/70 sm:text-xs">Saldo</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Feiertag / Urlaub */}
      {isVacation && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm">
          🏖️ Heute ist dein Urlaubstag — genieß die freie Zeit!
          Tagessoll ({tgt?.toFixed(1) ?? "–"} h) wird angerechnet.
        </div>
      )}
      {isHoliday && holidayName && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2.5 text-xs text-purple-800 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm">
          🎉 Heute ist {holidayName} — dein Tagessoll wird angerechnet.
        </div>
      )}

      {/* Aktions-Buttons */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Link
          href="/user/einsaetze"
          className="flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 sm:py-4 sm:text-base"
        >
          ＋ Neuer Einsatz
        </Link>
        <Link
          href="/user/urlaub"
          className="flex items-center justify-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 sm:py-4 sm:text-base"
        >
          🏖️ Mein Urlaub
        </Link>
      </div>

      {/* Monatsdetails — klappbar */}
      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm sm:rounded-3xl">
        <summary className="flex cursor-pointer items-center justify-between p-4 sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:text-xs">
            {monthName} · Tag {wdElapsed}/{wdTotal} · Prognose {proj.toFixed(0)} h
          </p>
          <span className="text-xs text-slate-400 transition group-open:rotate-180">▼</span>
        </summary>
        <div className="border-t border-slate-100 px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="divide-y divide-slate-100">
            <StatRow
              label="Betreuung"
              value={`${patientRaw.toFixed(1)} + 10% = ${(patientRaw * 1.1).toFixed(1)} h`}
            />
            {otherRaw > 0 && (
              <StatRow label="Sonstige" value={`${otherRaw.toFixed(1)} h`} />
            )}
            {holidayH > 0 && (
              <StatRow label="Feiertage" value={`${holidayH.toFixed(1)} h`} color="#7C3AED" />
            )}
            {vacH > 0 && (
              <StatRow label="Urlaub" value={`${vacH.toFixed(1)} h`} color="#D97706" />
            )}
            <StatRow label="Gesamt" value={`${totalH.toFixed(1)} h`} />
            {tgt != null && (
              <StatRow label="Soll / Tag" value={`${tgt.toFixed(1)} h`} />
            )}
            <StatRow label="Ø pro Arbeitstag" value={`${avg.toFixed(1)} h`} />
            <div className="pt-1">
              <StatRow
                label="Monatsprognose"
                value={`${proj.toFixed(0)} h`}
                color="#2563EB"
              />
              <p className="text-right text-[9px] text-slate-400">
                Ø {avg.toFixed(1)} × 5 × 4,33
              </p>
            </div>
          </div>
        </div>
      </details>

      {/* Schnellzugriffe */}
      <div className="grid grid-cols-2 gap-3">
        <ActionTile
          href="/user/patienten"
          icon="👥"
          iconBg="#f0fdf4"
          iconColor="#4F8A5B"
          title="Meine Patienten"
          subtitle="Details & Aktionen"
        />
        <ActionTile
          href="/user/buero-anfragen"
          icon="📋"
          iconBg="#eff6ff"
          iconColor="#2563EB"
          title="Anfrage ans Büro"
          subtitle="Urlaub, Krank, Vertretung"
        />
        <ActionTile
          href="/user/problem-melden"
          icon="🐛"
          iconBg="#fef2f2"
          iconColor="#DC2626"
          title="Problem melden"
          subtitle="Bug, Frage, Feature"
        />
      </div>

      {/* Spruch des Tages */}
      <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-4 sm:p-5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 sm:text-xs">
          ✨ Spruch des Tages
        </p>
        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-800 sm:text-base">
          {quote}
        </p>
      </div>

      {/* Ansprechpartner Büro */}
      {contact && (contact as any).phone && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-lg">
              📞
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Ansprechpartner Büro
              </p>
              <p className="text-xs text-slate-500">
                {(contact as any).phone} · Mo–Fr 09:00–16:00
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
