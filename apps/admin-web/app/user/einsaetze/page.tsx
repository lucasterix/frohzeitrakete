"use client";

import { useEffect, useState } from "react";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";
import SignatureCanvas from "@/components/signature-canvas";
import { AlertCircleIcon, CheckCircleIcon } from "@/components/icons";

const ENTRY_TYPES = [
  { value: "patient", label: "Patient", icon: "👤" },
  { value: "office", label: "Büro", icon: "🏢" },
  { value: "training", label: "Fortbildung", icon: "📚" },
  { value: "home_commute", label: "Heimfahrt", icon: "🚗" },
  { value: "other", label: "Sonstiges", icon: "📋" },
];

const ACTIVITIES = ["Alltagshilfe", "Gespräche/Aktivierung", "Begleitung"];
const HOUR_PRESETS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8];

type Patient = { patient_id: number; display_name: string };

export default function UserEinsaetzePage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const [entryType, setEntryType] = useState("patient");
  const [patientId, setPatientId] = useState<number | null>(null);
  const [categoryLabel, setCategoryLabel] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState<number | null>(null);
  const [activities, setActivities] = useState<Set<string>>(new Set());
  const [lateReason, setLateReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Trip (Fahrt) fields
  const [tripDriven, setTripDriven] = useState(false);
  const [tripStartAddress, setTripStartAddress] = useState("");

  // Signature step
  const [showSignature, setShowSignature] = useState(false);
  const [savedEntryPatient, setSavedEntryPatient] = useState<Patient | null>(null);

  const isLate = entryDate < new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const minDate = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const isPatient = entryType === "patient";
  const needsCategory = !isPatient && entryType !== "home_commute";

  // Read URL params for pre-selection
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlPatient = params.get("patient");
    if (urlPatient) {
      setPatientId(Number(urlPatient) || null);
      setEntryType("patient");
    }
    if (params.get("trip") === "1") {
      setTripDriven(true);
    }
  }, []);

  useEffect(() => {
    fetchWithRefresh(`${API_BASE_URL}/mobile/patients`, { headers: buildHeaders() })
      .then((r) => r.json())
      .then((data: Patient[]) => setPatients(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (isPatient && !patientId) return setError("Bitte Patient wählen.");
    if (!hours && entryType !== "home_commute") return setError("Bitte Stunden wählen.");
    if (isPatient && activities.size === 0) return setError("Bitte Tätigkeit wählen.");
    if (needsCategory && !categoryLabel.trim()) return setError("Bitte Beschreibung angeben.");
    if (isLate && lateReason.trim().length < 10)
      return setError("Begründung (mind. 10 Zeichen) bei nachträglicher Erfassung.");

    setSaving(true);
    setError("");
    setFlash("");
    try {
      const body: Record<string, any> = {
        entry_type: entryType,
        entry_date: entryDate,
        hours: hours ?? 0,
        activities: isPatient ? [...activities] : [],
      };
      if (isPatient) body.patient_id = patientId;
      if (needsCategory) body.category_label = categoryLabel.trim();
      if (isLate) body.late_entry_reason = lateReason.trim();
      if (isPatient && tripDriven) {
        body.trip = {
          start_from_home: !tripStartAddress.trim(),
          start_address: tripStartAddress.trim() || null,
        };
      }

      const res = await fetchWithRefresh(`${API_BASE_URL}/mobile/entries`, {
        method: "POST",
        headers: { ...buildHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Fehler");
      }
      if (isPatient) {
        const pat = patients.find((p) => p.patient_id === patientId);
        setSavedEntryPatient(pat || null);
        setShowSignature(true);
      } else {
        setFlash(`${ENTRY_TYPES.find((t) => t.value === entryType)?.label}-Einsatz gespeichert!`);
        resetForm();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignature(svg: string) {
    if (!savedEntryPatient) return;
    try {
      const res = await fetchWithRefresh(`${API_BASE_URL}/mobile/signatures`, {
        method: "POST",
        headers: { ...buildHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: savedEntryPatient.patient_id,
          document_type: "leistungsnachweis",
          signer_name: savedEntryPatient.display_name,
          svg_content: svg,
          source: "web",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Signatur-Fehler");
      }
      setFlash("Einsatz + Unterschrift gespeichert!");
    } catch (e) {
      setFlash(`Einsatz gespeichert, Unterschrift fehlgeschlagen: ${e instanceof Error ? e.message : "Fehler"}`);
    }
    setShowSignature(false);
    setSavedEntryPatient(null);
    resetForm();
  }

  function resetForm() {
    setHours(null);
    setActivities(new Set());
    setCategoryLabel("");
    setLateReason("");
    setTripDriven(false);
    setTripStartAddress("");
  }

  if (loading) return <div className="h-64 animate-pulse rounded-2xl bg-white/60" />;

  // Signature screen
  if (showSignature && savedEntryPatient) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-bold text-slate-900">
            Unterschrift von {savedEntryPatient.display_name}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Bitte den Patienten hier unterschreiben lassen. Die Unterschrift
            bestätigt den Leistungsnachweis.
          </p>
          <div className="mt-4">
            <SignatureCanvas onSignature={handleSignature} />
          </div>
          <button
            onClick={() => {
              setShowSignature(false);
              setFlash("Einsatz gespeichert (ohne Unterschrift).");
              resetForm();
            }}
            className="mt-3 w-full text-center text-xs text-slate-400 underline"
          >
            Ohne Unterschrift fortfahren
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur sm:rounded-3xl sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Einsatz erfassen
        </h1>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <AlertCircleIcon className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {flash && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <CheckCircleIcon className="h-4 w-4 shrink-0" /> {flash}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        {/* Entry Type */}
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Art des Einsatzes
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {ENTRY_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setEntryType(t.value)}
              className={`rounded-xl px-3 py-2 text-xs font-medium transition sm:text-sm ${
                entryType === t.value
                  ? "bg-brand-600 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Patient select */}
        {isPatient && (
          <div className="mb-4">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Patient
            </p>
            <select
              value={patientId ?? ""}
              onChange={(e) => setPatientId(Number(e.target.value) || null)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
            >
              <option value="">Patient wählen …</option>
              {patients.map((p) => (
                <option key={p.patient_id} value={p.patient_id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Category label for non-patient */}
        {needsCategory && (
          <div className="mb-4">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Beschreibung
            </p>
            <input
              value={categoryLabel}
              onChange={(e) => setCategoryLabel(e.target.value)}
              placeholder={entryType === "training" ? "z.B. Demenz-Schulung" : "z.B. Monatsmeeting"}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
            />
          </div>
        )}

        {/* Date */}
        <div className="mb-4">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Datum
          </p>
          <input
            type="date"
            value={entryDate}
            min={minDate}
            max={today}
            onChange={(e) => setEntryDate(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
          />
        </div>

        {/* Hours */}
        {entryType !== "home_commute" && (
          <div className="mb-4">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Stunden
            </p>
            <div className="flex flex-wrap gap-1.5">
              {HOUR_PRESETS.map((h) => (
                <button
                  key={h}
                  onClick={() => setHours(h)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    hours === h
                      ? "bg-brand-600 text-white"
                      : "border border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Activities */}
        {isPatient && (
          <div className="mb-4">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Tätigkeiten
            </p>
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
                    className={`rounded-xl px-3 py-2 text-xs font-medium transition sm:text-sm ${
                      sel
                        ? "bg-emerald-600 text-white"
                        : "border border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Trip / Fahrt */}
        {isPatient && (
          <div className="mb-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={tripDriven}
                onChange={(e) => setTripDriven(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-xs font-medium text-slate-700 sm:text-sm">
                Ich bin zum Patienten gefahren
              </span>
            </label>
            {tripDriven && (
              <input
                value={tripStartAddress}
                onChange={(e) => setTripStartAddress(e.target.value)}
                placeholder="Startadresse (z.B. Musterstr. 1, 12345 Berlin)"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
              />
            )}
          </div>
        )}

        {/* Late entry warning */}
        {isLate && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-semibold text-red-800">
              ⚠️ Nachträgliche Erfassung — Begründung erforderlich
            </p>
            <textarea
              value={lateReason}
              onChange={(e) => setLateReason(e.target.value)}
              rows={2}
              className="mt-2 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-xs outline-none"
              placeholder="z.B. Patient war nicht anwesend (mind. 10 Zeichen)"
            />
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? "Speichere …" : isPatient ? "Speichern & Unterschreiben" : "Speichern"}
        </button>
      </div>
    </div>
  );
}
