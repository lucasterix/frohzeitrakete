"use client";

import { useEffect, useState } from "react";
import {
  LeistungsnachweisPatient,
  User,
  getLeistungsnachweisPatients,
  getUsers,
  leistungsnachweisPdfUrl,
  leistungsnachweiseAllZipUrl,
  leistungsnachweiseZipUrl,
  setLeistungsnachweisOfficeProcessed,
} from "@/lib/api";
import { useRequireOffice } from "@/lib/use-require-role";
import { AlertCircleIcon, SparkleIcon } from "@/components/icons";

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

type UserRow = {
  user: User;
  patients: LeistungsnachweisPatient[] | null;
  loading: boolean;
  error: string | null;
};

export default function LeistungsnachweisePage() {
  const { authorized, isLoading } = useRequireOffice();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    (async () => {
      try {
        const users = await getUsers();
        const caretakers = users.filter((u) => u.role === "caretaker");
        if (!cancelled) {
          setRows(
            caretakers.map((u) => ({
              user: u,
              patients: null,
              loading: false,
              error: null,
            }))
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Fehler beim Laden");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [authorized]);

  async function loadPatientsFor(userId: number) {
    setRows((rows) =>
      rows.map((r) =>
        r.user.id === userId ? { ...r, loading: true, error: null } : r
      )
    );
    try {
      const patients = await getLeistungsnachweisPatients(userId, year, month);
      setRows((rows) =>
        rows.map((r) =>
          r.user.id === userId
            ? { ...r, patients, loading: false }
            : r
        )
      );
    } catch (err) {
      setRows((rows) =>
        rows.map((r) =>
          r.user.id === userId
            ? {
                ...r,
                loading: false,
                error: err instanceof Error ? err.message : "Fehler",
              }
            : r
        )
      );
    }
  }

  async function loadAll() {
    for (const r of rows) {
      await loadPatientsFor(r.user.id);
    }
  }

  async function toggleProcessed(
    userId: number,
    patient: LeistungsnachweisPatient
  ) {
    const newState = !patient.office_processed_at;
    try {
      await setLeistungsnachweisOfficeProcessed(
        userId,
        patient.id,
        year,
        month,
        newState
      );
      setRows((rows) =>
        rows.map((r) =>
          r.user.id === userId && r.patients
            ? {
                ...r,
                patients: r.patients.map((p) =>
                  p.id === patient.id
                    ? {
                        ...p,
                        office_processed_at: newState
                          ? new Date().toISOString()
                          : null,
                      }
                    : p
                ),
              }
            : r
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  }

  function prevMonth() {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
    setRows((rows) =>
      rows.map((r) => ({ ...r, patients: null, error: null }))
    );
  }

  function nextMonth() {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
    setRows((rows) =>
      rows.map((r) => ({ ...r, patients: null, error: null }))
    );
  }

  if (isLoading || !authorized) {
    return <div className="h-64 animate-pulse rounded-3xl bg-white/60" />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Monats-Abschluss
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              Leistungsnachweise
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Zieht die Leistungsnachweis-PDFs direkt aus Patti (mit
              QR-Code) — nur für Patienten, bei denen im Monat
              tatsächlich Stunden erfasst wurden.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ←
            </button>
            <div className="min-w-[180px] text-center font-semibold">
              {MONTH_NAMES[month - 1]} {year}
            </div>
            <button
              onClick={nextMonth}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              →
            </button>
            <button
              onClick={loadAll}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
            >
              <SparkleIcon className="h-4 w-4" />
              Alle laden
            </button>
            <a
              href={leistungsnachweiseAllZipUrl(year, month)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
              title="Alle Leistungsnachweise aller Betreuer als ein ZIP"
            >
              📦 Alle Betreuer ZIP
            </a>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircleIcon className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {rows.length === 0 ? (
          <div className="text-sm text-slate-400">
            Keine aktiven Betreuer gefunden.
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map(({ user, patients, loading, error }) => (
              <li
                key={user.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-900">
                      {user.full_name}
                    </p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => loadPatientsFor(user.id)}
                      disabled={loading}
                      className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      {loading ? "Lade …" : "Patienten laden"}
                    </button>
                    {patients && patients.length > 0 && (
                      <a
                        href={leistungsnachweiseZipUrl(user.id, year, month)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800"
                        title="Alle Leistungsnachweise dieses Betreuers für den Monat als ZIP"
                      >
                        📦 Alle als ZIP
                      </a>
                    )}
                  </div>
                </div>
                {error && (
                  <p className="mt-2 text-xs text-red-600">{error}</p>
                )}
                {patients !== null && (
                  <div className="mt-3">
                    {patients.length === 0 ? (
                      <p className="text-xs text-slate-400">
                        Keine Einsätze in diesem Monat.
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                        {patients.map((p) => {
                          const done = !!p.office_processed_at;
                          return (
                            <li
                              key={p.id}
                              className={`flex items-center justify-between gap-3 px-3 py-2 ${
                                done ? "bg-emerald-50/50" : ""
                              }`}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm text-slate-800">
                                  {p.name}
                                </span>
                                {done && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                                    Bearbeitet
                                  </span>
                                )}
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                <a
                                  href={leistungsnachweisPdfUrl(
                                    user.id,
                                    p.id,
                                    year,
                                    month,
                                    "patti"
                                  )}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-brand-700"
                                >
                                  PDF ↗
                                </a>
                                <button
                                  onClick={() => toggleProcessed(user.id, p)}
                                  className={`inline-flex items-center gap-1 rounded-2xl px-3 py-1.5 text-xs font-medium transition ${
                                    done
                                      ? "border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                  }`}
                                >
                                  {done ? "↶ Zurücksetzen" : "✓ Bearbeitet"}
                                </button>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
