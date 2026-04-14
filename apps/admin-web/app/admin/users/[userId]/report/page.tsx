"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getUserWorkReport,
  type WorkReport,
  type WorkReportDay,
  type WorkReportEntry,
} from "@/lib/api";

const MONTH_NAMES = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

function formatHours(h: number): string {
  const full = Math.floor(h);
  const half = h - full >= 0.5;
  return `${full},${half ? "5" : "0"} h`;
}

function formatKm(k: number | null): string {
  if (k == null) return "—";
  return `${k.toFixed(1)} km`;
}

function formatDateDe(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

const TYPE_LABELS: Record<WorkReportEntry["type"], string> = {
  patient: "👤 Patient",
  office: "🏢 Büro",
  training: "🎓 Fortbildung",
  other: "📋 Sonstiges",
};

export default function UserReportPage() {
  const params = useParams<{ userId: string }>();
  const userId = Number(params?.userId);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [report, setReport] = useState<WorkReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getUserWorkReport(userId, year, month);
      setReport(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [userId, year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const prevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  };

  const nextMonth = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/users"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Zurück
        </Link>
        <h1 className="text-2xl font-bold">Mitarbeiter-Report</h1>
      </div>

      {report && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                {report.user.full_name}
              </h2>
              <p className="text-sm text-slate-500">
                {report.user.email} · {report.user.role}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                className="rounded-lg border border-slate-200 px-3 py-1 hover:bg-slate-50"
              >
                ←
              </button>
              <div className="min-w-[140px] text-center font-semibold">
                {MONTH_NAMES[month - 1]} {year}
              </div>
              <button
                onClick={nextMonth}
                className="rounded-lg border border-slate-200 px-3 py-1 hover:bg-slate-50"
              >
                →
              </button>
            </div>
          </div>
        </div>
      )}

      {report && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="Arbeitstage"
            value={String(report.working_days)}
            icon="📅"
          />
          <StatCard
            label="Gesamtstunden"
            value={formatHours(report.total_hours)}
            icon="⏱"
          />
          <StatCard
            label="Gesamt-km"
            value={formatKm(report.total_km)}
            icon="🚗"
          />
        </div>
      )}

      {loading && <div className="text-slate-500">Lade…</div>}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          {error}
        </div>
      )}

      {report && !loading && report.days.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
          Keine Einsätze in diesem Monat.
        </div>
      )}

      {report && (
        <div className="space-y-4">
          {report.days.map((day) => (
            <DayCard key={day.date} day={day} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">
        {icon} {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function DayCard({ day }: { day: WorkReportDay }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 p-4">
        <div className="font-semibold">{formatDateDe(day.date)}</div>
        <div className="flex gap-4 text-sm text-slate-600">
          <span>⏱ {formatHours(day.day_hours)}</span>
          {day.day_km > 0 && <span>🚗 {formatKm(day.day_km)}</span>}
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {day.entries.map((e) => (
          <div key={e.id} className="flex items-start gap-3 p-4">
            <div className="w-28 flex-shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {TYPE_LABELS[e.type] ?? e.type}
            </div>
            <div className="flex-1">
              <div className="font-medium">
                {e.patient_name ?? e.label ?? "—"}
              </div>
              {e.activities.length > 0 && (
                <div className="mt-1 text-sm text-slate-500">
                  {e.activities.join(", ")}
                </div>
              )}
              {e.note && (
                <div className="mt-1 text-xs text-slate-400 italic">
                  {e.note}
                </div>
              )}
            </div>
            <div className="flex-shrink-0 font-semibold text-emerald-700">
              {formatHours(e.hours)}
            </div>
          </div>
        ))}
      </div>

      {day.trips.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Fahrten
          </div>
          <div className="space-y-1">
            {day.trips.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-4 text-sm"
              >
                <div className="truncate text-slate-600">
                  {t.from_address} → {t.to_address}
                </div>
                <div className="flex-shrink-0 text-slate-700">
                  {formatKm(t.distance_km)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
