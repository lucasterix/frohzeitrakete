"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";
import {
  AlertCircleIcon,
  CheckCircleIcon,
} from "@/components/icons";

const ACTIVITIES = ["Alltagshilfe", "Gespräche/Aktivierung", "Begleitung"];
const HOUR_PRESETS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8];

type Patient = { patientId: number; firstName: string; lastName: string };

export default function UserEinsaetzePage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const [patientId, setPatientId] = useState<number | null>(null);
  const [entryDate, setEntryDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [hours, setHours] = useState<number | null>(null);
  const [activities, setActivities] = useState<Set<string>>(new Set());
  const [lateReason, setLateReason] = useState("");
  const [saving, setSaving] = useState(false);

  const isLate = entryDate < new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const minDate = new Date(
    Date.now() - 14 * 24 * 60 * 60 * 1000
  ).toISOString().slice(0, 10);

  useEffect(() => {
    fetchWithRefresh(`${API_BASE_URL}/mobile/patients`, {
      headers: buildHeaders(),
    })
      .then((r) => r.json())
      .then((data) => setPatients(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!patientId) {
      setError("Bitte Patient wählen.");
      return;
    }
    if (!hours) {
      setError("Bitte Stunden wählen.");
      return;
    }
    if (activities.size === 0) {
      setError("Bitte mindestens eine Tätigkeit wählen.");
      return;
    }
    if (isLate && lateReason.trim().length < 10) {
      setError(
        "Bei nachträglicher Erfassung ist eine Begründung (mind. 10 Zeichen) erforderlich."
      );
      return;
    }
    setSaving(true);
    setError("");
    setFlash("");
    try {
      const body: Record<string, any> = {
        patient_id: patientId,
        entry_date: entryDate,
        hours,
        activities: [...activities],
        entry_type: "patient",
      };
      if (isLate) body.late_entry_reason = lateReason.trim();
      const res = await fetchWithRefresh(`${API_BASE_URL}/mobile/entries`, {
        method: "POST",
        headers: { ...buildHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Fehler beim Speichern");
      }
      setFlash("Einsatz gespeichert!");
      setHours(null);
      setActivities(new Set());
      setLateReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-3xl bg-white/60" />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur sm:rounded-3xl sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Einsatz erfassen
        </h1>
        <p className="mt-1 text-xs text-slate-600 sm:text-sm">
          Wähle Patient, Datum, Stunden und Tätigkeit. Im Regelfall wird nur das
          heutige Datum verwendet.
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

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Patient */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Patient
            </span>
            <select
              value={patientId ?? ""}
              onChange={(e) => setPatientId(Number(e.target.value) || null)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:bg-white"
            >
              <option value="">Patient wählen …</option>
              {patients.map((p) => (
                <option key={p.patientId} value={p.patientId}>
                  {p.firstName} {p.lastName}
                </option>
              ))}
            </select>
          </label>

          {/* Datum */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Datum
            </span>
            <input
              type="date"
              value={entryDate}
              min={minDate}
              max={today}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:bg-white"
            />
          </label>

          {/* Stunden */}
          <div className="lg:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Stunden
            </span>
            <div className="flex flex-wrap gap-2">
              {HOUR_PRESETS.map((h) => (
                <button
                  key={h}
                  onClick={() => setHours(h)}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                    hours === h
                      ? "bg-brand-600 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {h.toFixed(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Tätigkeiten */}
          <div className="lg:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Tätigkeiten
            </span>
            <div className="flex flex-wrap gap-2">
              {ACTIVITIES.map((a) => {
                const sel = activities.has(a);
                return (
                  <button
                    key={a}
                    onClick={() => {
                      const next = new Set(activities);
                      sel ? next.delete(a) : next.add(a);
                      setActivities(next);
                    }}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      sel
                        ? "bg-emerald-600 text-white"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Nachträgliche Erfassung */}
        {isLate && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-800">
              ⚠️ Nachträgliche Erfassung — Begründung erforderlich
            </p>
            <p className="mt-1 text-xs text-red-700">
              z.B. &quot;Patient war nicht anwesend und hat am Folgetag
              unterschrieben&quot;
            </p>
            <textarea
              value={lateReason}
              onChange={(e) => setLateReason(e.target.value)}
              rows={2}
              className="mt-2 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
              placeholder="Begründung eingeben (mind. 10 Zeichen) …"
            />
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-5 w-full rounded-2xl bg-brand-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? "Wird gespeichert …" : "Einsatz speichern"}
        </button>
      </section>
    </div>
  );
}
