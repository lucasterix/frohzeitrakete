"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";
import {
  AlertCircleIcon,
  CheckCircleIcon,
} from "@/components/icons";

const MONTH_NAMES = [
  "", "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

export default function UserUrlaubPage() {
  const [vacDates, setVacDates] = useState<string[]>([]);
  const [totalDays, setTotalDays] = useState(0);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [ovRes, reqRes] = await Promise.all([
        fetchWithRefresh(`${API_BASE_URL}/mobile/me/vacation-overview`, {
          headers: buildHeaders(),
        }),
        fetchWithRefresh(`${API_BASE_URL}/mobile/vacation-requests`, {
          headers: buildHeaders(),
        }),
      ]);
      if (ovRes.ok) {
        const ov = await ovRes.json();
        setVacDates(ov.vacation_dates || []);
        setTotalDays(ov.total_days || 0);
      }
      if (reqRes.ok) {
        setRequests(await reqRes.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromDate || !toDate) {
      setError("Bitte Von- und Bis-Datum angeben.");
      return;
    }
    setSubmitting(true);
    setError("");
    setFlash("");
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/mobile/vacation-requests`,
        {
          method: "POST",
          headers: { ...buildHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            from_date: fromDate,
            to_date: toDate,
            note: note.trim() || null,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Fehler beim Einreichen");
      }
      setFlash("Urlaubsantrag eingereicht! Das Büro wird benachrichtigt.");
      setFromDate("");
      setToDate("");
      setNote("");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-3xl bg-white/60" />;
  }

  const byMonth: Record<number, string[]> = {};
  for (const d of vacDates) {
    const m = new Date(d).getMonth() + 1;
    (byMonth[m] ||= []).push(d);
  }
  const months = Object.keys(byMonth)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Mein Urlaub
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {totalDays} genehmigte Urlaubstage · Antrag einreichen + Übersicht
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircleIcon className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}
      {flash && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircleIcon className="h-5 w-5 shrink-0" />
          {flash}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Antrag */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Urlaub beantragen
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Das Büro wird automatisch benachrichtigt und kann deinen Antrag
            genehmigen oder ablehnen.
          </p>
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  Von
                </span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  Bis
                </span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
                  required
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                Bemerkung (optional)
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl bg-brand-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {submitting ? "Wird eingereicht …" : "Antrag einreichen"}
            </button>
          </form>
        </section>

        {/* Anträge */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Meine Anträge
          </h2>
          {requests.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">Noch keine Anträge.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {requests.map((r: any) => {
                const st = r.status as string;
                const color =
                  st === "approved"
                    ? "text-emerald-800 bg-emerald-50 border-emerald-200"
                    : st === "rejected"
                      ? "text-red-800 bg-red-50 border-red-200"
                      : "text-slate-700 bg-slate-50 border-slate-200";
                const label =
                  st === "approved"
                    ? "Genehmigt"
                    : st === "rejected"
                      ? "Abgelehnt"
                      : st === "partially_approved"
                        ? "Teilweise"
                        : "Offen";
                return (
                  <li
                    key={r.id}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${color}`}
                  >
                    <span>
                      {r.from_date} – {r.to_date}
                    </span>
                    <span className="text-xs font-semibold uppercase">
                      {label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Jahresübersicht */}
      {vacDates.length > 0 && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Genehmigter Urlaub 2026 · {totalDays} Tage
          </h2>
          <div className="mt-4 space-y-2">
            {months.map((m) => (
              <div key={m} className="flex items-start gap-3">
                <span className="w-8 text-xs font-semibold text-slate-500">
                  {MONTH_NAMES[m]}
                </span>
                <div className="flex flex-wrap gap-1">
                  {byMonth[m].map((d) => {
                    const dt = new Date(d);
                    const past = dt < new Date();
                    return (
                      <span
                        key={d}
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          past
                            ? "bg-slate-100 text-slate-400"
                            : "bg-amber-50 text-amber-800"
                        }`}
                      >
                        {dt.getDate()}.
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
