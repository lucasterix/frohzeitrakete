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

  // Trip (Fahrt mit/für Patient) fields
  const [tripDriven, setTripDriven] = useState(false);
  const [tripKm, setTripKm] = useState<string>("");
  const [tripDestination, setTripDestination] = useState("");

  // Signature step
  const [showSignature, setShowSignature] = useState(false);
  const [savedEntryPatient, setSavedEntryPatient] = useState<Patient | null>(null);

  // Remote signature link
  const [remoteSignUrl, setRemoteSignUrl] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  // Substitution search
  const [showSubSearch, setShowSubSearch] = useState(false);
  const [subQuery, setSubQuery] = useState("");
  const [subResults, setSubResults] = useState<Patient[]>([]);
  const [subLoading, setSubLoading] = useState(false);

  // Debounced substitution search
  useEffect(() => {
    if (!showSubSearch || subQuery.trim().length < 2) {
      setSubResults([]);
      return;
    }
    setSubLoading(true);
    const timeout = setTimeout(() => {
      fetchWithRefresh(
        `${API_BASE_URL}/mobile/patients/search?q=${encodeURIComponent(subQuery)}`,
        { headers: buildHeaders() }
      )
        .then((r) => r.json())
        .then((data: Patient[]) => setSubResults(data))
        .catch(() => setSubResults([]))
        .finally(() => setSubLoading(false));
    }, 400);
    return () => clearTimeout(timeout);
  }, [subQuery, showSubSearch]);

  const isLate = entryDate < new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const minDate = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const isPatient = entryType === "patient";
  const needsCategory = !isPatient && entryType !== "home_commute";

  // Pre-selected patient from URL → lock entry type to "patient"
  const [hasPreselectedPatient, setHasPreselectedPatient] = useState(false);

  // Read URL params for pre-selection
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlPatient = params.get("patient");
    if (urlPatient) {
      setPatientId(Number(urlPatient) || null);
      setEntryType("patient");
      setHasPreselectedPatient(true);
    }
    if (params.get("km") === "1") {
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
      if (isPatient && tripDriven && tripKm) {
        body.trip = {
          km: parseFloat(tripKm) || 0,
          destination: tripDestination.trim() || null,
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
    setTripKm("");
    setTripDestination("");
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
          {/* Remote signature link */}
          {!remoteSignUrl ? (
            <button
              onClick={async () => {
                if (!savedEntryPatient) return;
                setGeneratingLink(true);
                try {
                  const dateStr = entryDate;
                  const desc = `Einsatz vom ${dateStr}, ${hours}h`;
                  const res = await fetchWithRefresh(`${API_BASE_URL}/mobile/remote-signatures`, {
                    method: "POST",
                    headers: { ...buildHeaders(), "Content-Type": "application/json" },
                    body: JSON.stringify({
                      patient_id: savedEntryPatient.patient_id,
                      patient_name: savedEntryPatient.display_name,
                      document_type: "leistungsnachweis",
                      description: desc,
                    }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    setRemoteSignUrl(data.url);
                  }
                } catch (_) {}
                setGeneratingLink(false);
              }}
              disabled={generatingLink}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {generatingLink ? "Erstelle Link…" : "Patient nicht vor Ort? Signatur-Link generieren"}
            </button>
          ) : (
            <div className="mt-3 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-semibold text-emerald-700">
                Signatur-Link erstellt (7 Tage gueltig):
              </p>
              <div className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600 break-all">
                {remoteSignUrl}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(remoteSignUrl);
                    setFlash("Link kopiert!");
                  }}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50"
                >
                  Link kopieren
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent("Bitte unterschreiben Sie hier: " + remoteSignUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-lg bg-[#25D366] px-3 py-2 text-center text-xs font-medium text-white hover:bg-[#1DA851]"
                >
                  Per WhatsApp teilen
                </a>
              </div>
            </div>
          )}

          <button
            onClick={() => {
              setShowSignature(false);
              setRemoteSignUrl(null);
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
        {/* Entry Type — hidden when patient is pre-selected via URL */}
        {!hasPreselectedPatient && (
          <>
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
          </>
        )}

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
            {/* Substitution search */}
            <button
              type="button"
              onClick={() => {
                setShowSubSearch(!showSubSearch);
                if (showSubSearch) {
                  setSubQuery("");
                  setSubResults([]);
                }
              }}
              className={`mt-2 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                showSubSearch
                  ? "border border-emerald-400 bg-emerald-50 text-emerald-700"
                  : "border border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              <span className="text-sm">&#x21C4;</span> Vertretung: Anderen Patienten suchen
            </button>
            {showSubSearch && (
              <div className="mt-2 space-y-2">
                <input
                  value={subQuery}
                  onChange={(e) => setSubQuery(e.target.value)}
                  placeholder="Name eingeben (mind. 2 Zeichen)…"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
                />
                {subLoading && (
                  <p className="text-xs text-slate-400">Suche…</p>
                )}
                {!subLoading && subQuery.trim().length >= 2 && subResults.length === 0 && (
                  <p className="text-xs text-slate-400">Keine Patienten gefunden.</p>
                )}
                {subResults.length > 0 && (
                  <ul className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                    {subResults.map((p) => (
                      <li key={p.patient_id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPatientId(p.patient_id);
                            // Add to patients list if not already there
                            if (!patients.find((x) => x.patient_id === p.patient_id)) {
                              setPatients((prev) => [p, ...prev]);
                            }
                            setShowSubSearch(false);
                            setSubQuery("");
                            setSubResults([]);
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                        >
                          {p.display_name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
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

        {/* Trip / Fahrt mit/für Patient */}
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
                Gefahrene km mit/für den Patienten
              </span>
            </label>
            {tripDriven && (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={tripKm}
                  onChange={(e) => setTripKm(e.target.value)}
                  placeholder="Gefahrene Kilometer"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400 sm:w-40"
                />
                <input
                  value={tripDestination}
                  onChange={(e) => setTripDestination(e.target.value)}
                  placeholder="Wohin? (z.B. Arzt, Einkauf, Apotheke)"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
                />
              </div>
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
