"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireRole } from "@/lib/use-require-role";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";
import { AlertCircleIcon, CheckCircleIcon } from "@/components/icons";

type Kostentraeger = {
  id: number;
  name: string;
  ik: string;
};

type Hilfsmittel = {
  id: number;
  bezeichnung: string;
  positionsnr: string;
  packungsgroesse: number;
  preis_cent: number;
};

type Patient = {
  id: number;
  name: string;
  versichertennummer: string;
  geburtsdatum: string | null;
  address: string;
  kasse_id: number | null;
  kasse_name: string | null;
};

type SelectedItem = {
  hilfsmittel_id: number;
  menge: number;
};

function formatEuro(cent: number): string {
  return (cent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default function NeueAbrechnungPage() {
  const router = useRouter();
  const { isLoading: authLoading, authorized } = useRequireRole(["admin", "pflegehilfsmittel"]);
  const [kostentraeger, setKostentraeger] = useState<Kostentraeger[]>([]);
  const [hilfsmittel, setHilfsmittel] = useState<Hilfsmittel[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  // Patient selection mode
  const [usePatientDropdown, setUsePatientDropdown] = useState(true);
  const [selectedPatientId, setSelectedPatientId] = useState<number | "">("");

  // Form state
  const [patientName, setPatientName] = useState("");
  const [versichertennr, setVersichertennr] = useState("");
  const [geburtsdatum, setGeburtsdatum] = useState("");
  const [kostentraegerId, setKostentraegerId] = useState<number | "">("");
  const [monat, setMonat] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [ktRes, hmRes, pRes] = await Promise.all([
        fetchWithRefresh(`${API_BASE_URL}/admin/pflegehilfsmittel/kostentraeger`, {
          headers: buildHeaders(),
        }),
        fetchWithRefresh(`${API_BASE_URL}/admin/pflegehilfsmittel/hilfsmittel`, {
          headers: buildHeaders(),
        }),
        fetchWithRefresh(`${API_BASE_URL}/admin/pflegehilfsmittel/patients`, {
          headers: buildHeaders(),
        }),
      ]);
      if (ktRes.ok) setKostentraeger(await ktRes.json());
      if (hmRes.ok) setHilfsmittel(await hmRes.json());
      if (pRes.ok) setPatients(await pRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden der Stammdaten");
    }
  }, []);

  useEffect(() => {
    if (authorized) void loadData();
  }, [authorized, loadData]);

  // When a patient is selected from dropdown, auto-fill fields
  useEffect(() => {
    if (!selectedPatientId) return;
    const p = patients.find((pat) => pat.id === selectedPatientId);
    if (!p) return;
    setPatientName(p.name);
    setVersichertennr(p.versichertennummer || "");
    setGeburtsdatum(p.geburtsdatum || "");
    if (p.kasse_id) setKostentraegerId(p.kasse_id);
  }, [selectedPatientId, patients]);

  function toggleItem(id: number) {
    setSelectedItems((prev) => {
      const exists = prev.find((s) => s.hilfsmittel_id === id);
      if (exists) return prev.filter((s) => s.hilfsmittel_id !== id);
      return [...prev, { hilfsmittel_id: id, menge: 1 }];
    });
  }

  function setMenge(id: number, menge: number) {
    setSelectedItems((prev) =>
      prev.map((s) => (s.hilfsmittel_id === id ? { ...s, menge: Math.max(1, menge) } : s))
    );
  }

  const gesamtbetrag = selectedItems.reduce((sum, sel) => {
    const hm = hilfsmittel.find((h) => h.id === sel.hilfsmittel_id);
    return sum + (hm ? hm.preis_cent * sel.menge : 0);
  }, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!patientName.trim()) {
      setError("Patient-Name ist erforderlich");
      return;
    }
    if (!kostentraegerId) {
      setError("Bitte Kostentraeger waehlen");
      return;
    }
    if (selectedItems.length === 0) {
      setError("Bitte mindestens ein Hilfsmittel waehlen");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        patient_name: patientName.trim(),
        versichertennr: versichertennr.trim(),
        geburtsdatum: geburtsdatum.trim(),
        kostentraeger_id: kostentraegerId,
        monat,
        positionen: selectedItems,
      };
      if (usePatientDropdown && selectedPatientId) {
        body.patient_id = selectedPatientId;
      }

      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/pflegehilfsmittel/abrechnungen`,
        {
          method: "POST",
          headers: { ...buildHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Speichern fehlgeschlagen");
      }
      setSuccess("Abrechnung erfolgreich erstellt!");
      setTimeout(() => router.push("/admin/pflegehilfsmittel/abrechnungen"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !authorized) return <div className="h-64 animate-pulse rounded-3xl bg-white/60" />;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Pflegehilfsmittel
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
          Neue Abrechnung
        </h1>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircleIcon className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircleIcon className="h-5 w-5 shrink-0" />
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Patient-Daten */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Patient</h2>

          {/* Toggle: Dropdown vs Freitext */}
          <div className="mb-4 flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                checked={usePatientDropdown}
                onChange={() => setUsePatientDropdown(true)}
                className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Gespeicherten Patienten auswaehlen
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                checked={!usePatientDropdown}
                onChange={() => {
                  setUsePatientDropdown(false);
                  setSelectedPatientId("");
                }}
                className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Daten manuell eingeben
            </label>
          </div>

          {usePatientDropdown && (
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Patient auswaehlen *
              </label>
              <select
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value ? Number(e.target.value) : "")}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Bitte waehlen...</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.versichertennummer})
                  </option>
                ))}
              </select>
              {patients.length === 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  Noch keine Patienten gespeichert. Freitext nutzen oder zuerst Patienten anlegen.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Name *</label>
              <input
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="Vor- und Nachname"
                readOnly={usePatientDropdown && !!selectedPatientId}
                className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${usePatientDropdown && selectedPatientId ? "bg-slate-50" : ""}`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Versichertennr.</label>
              <input
                type="text"
                value={versichertennr}
                onChange={(e) => setVersichertennr(e.target.value)}
                placeholder="z.B. A123456789"
                readOnly={usePatientDropdown && !!selectedPatientId}
                className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${usePatientDropdown && selectedPatientId ? "bg-slate-50" : ""}`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Geburtsdatum</label>
              <input
                type="text"
                value={geburtsdatum}
                onChange={(e) => setGeburtsdatum(e.target.value)}
                placeholder="TT.MM.JJJJ"
                readOnly={usePatientDropdown && !!selectedPatientId}
                className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${usePatientDropdown && selectedPatientId ? "bg-slate-50" : ""}`}
              />
            </div>
          </div>
        </section>

        {/* Kostentraeger + Monat */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Abrechnung</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Kostentraeger *</label>
              <select
                value={kostentraegerId}
                onChange={(e) => setKostentraegerId(e.target.value ? Number(e.target.value) : "")}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Bitte waehlen...</option>
                {kostentraeger.map((kt) => (
                  <option key={kt.id} value={kt.id}>
                    {kt.name} ({kt.ik})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Monat *</label>
              <input
                type="month"
                value={monat}
                onChange={(e) => setMonat(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
        </section>

        {/* Hilfsmittel */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Hilfsmittel</h2>
          {hilfsmittel.length === 0 ? (
            <p className="text-sm text-slate-400">Keine Hilfsmittel im Katalog.</p>
          ) : (
            <div className="space-y-3">
              {hilfsmittel.map((hm) => {
                const sel = selectedItems.find((s) => s.hilfsmittel_id === hm.id);
                const isChecked = !!sel;
                return (
                  <div
                    key={hm.id}
                    className={`flex items-center gap-4 rounded-2xl border p-4 transition ${
                      isChecked ? "border-brand-300 bg-brand-50/50" : "border-slate-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleItem(hm.id)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-slate-900">{hm.bezeichnung}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        Pos. {hm.positionsnr} | {hm.packungsgroesse} Stk. | {formatEuro(hm.preis_cent)}
                      </span>
                    </div>
                    {isChecked && (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-500">Menge:</label>
                        <input
                          type="number"
                          min={1}
                          value={sel!.menge}
                          onChange={(e) => setMenge(hm.id, parseInt(e.target.value) || 1)}
                          className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Gesamtbetrag + Submit */}
        <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-xs text-slate-500">Gesamtbetrag</p>
            <p className="text-2xl font-bold text-brand-700">{formatEuro(gesamtbetrag)}</p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-brand-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? "Speichere..." : "Abrechnung erstellen"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
