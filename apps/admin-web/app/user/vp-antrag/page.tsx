"use client";

import { useEffect, useState } from "react";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";
import SignatureCanvas from "@/components/signature-canvas";
import { AlertCircleIcon, CheckCircleIcon } from "@/components/icons";

type Patient = { patient_id: number; display_name: string };

export default function VpAntragPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const [step, setStep] = useState<"form" | "sign" | "done">("form");
  const [patientId, setPatientId] = useState<number | null>(null);
  const [pflegeperson, setPflegeperson] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchWithRefresh(`${API_BASE_URL}/mobile/patients`, { headers: buildHeaders() })
      .then((r) => r.json())
      .then((data: Patient[]) => setPatients(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSignature(svg: string) {
    if (!patientId || !pflegeperson.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetchWithRefresh(`${API_BASE_URL}/mobile/signatures`, {
        method: "POST",
        headers: { ...buildHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          document_type: "vp_antrag",
          signer_name: pflegeperson.trim(),
          svg_content: svg,
          source: "web",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Fehler");
      }
      setStep("done");
      setFlash("VP-Antrag mit Unterschrift eingereicht!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-64 animate-pulse rounded-2xl bg-white/60" />;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Verhinderungspflege-Antrag
        </h1>
        <p className="mt-1 text-xs text-slate-600">
          Antrag mit Patient-Unterschrift einreichen. Das Büro generiert das PDF und schickt es an die Kasse.
        </p>
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

      {step === "form" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Patient</span>
              <select value={patientId ?? ""} onChange={(e) => setPatientId(Number(e.target.value) || null)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400">
                <option value="">Patient wählen …</option>
                {patients.map((p) => (
                  <option key={p.patient_id} value={p.patient_id}>{p.display_name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Name der Pflegeperson</span>
              <input value={pflegeperson} onChange={(e) => setPflegeperson(e.target.value)}
                placeholder="Vor- und Nachname"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400" />
            </label>
            <button onClick={() => {
              if (!patientId) { setError("Patient wählen."); return; }
              if (!pflegeperson.trim()) { setError("Pflegeperson angeben."); return; }
              setError("");
              setStep("sign");
            }}
              className="w-full rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700">
              Weiter zur Unterschrift →
            </button>
          </div>
        </div>
      )}

      {step === "sign" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-1 text-lg font-bold text-slate-900">Unterschrift des Patienten</h2>
          <p className="mb-4 text-xs text-slate-500">
            Patient: {patients.find((p) => p.patient_id === patientId)?.display_name} · Pflegeperson: {pflegeperson}
          </p>
          <SignatureCanvas onSignature={handleSignature} />
          <button onClick={() => setStep("form")} className="mt-3 w-full text-center text-xs text-slate-400 underline">
            ← Zurück zum Formular
          </button>
        </div>
      )}

      {step === "done" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <p className="text-lg font-bold text-emerald-800">Antrag eingereicht!</p>
          <p className="mt-1 text-sm text-emerald-700">Das Büro wird den VP-Antrag aus Patti generieren und an die Krankenkasse schicken.</p>
          <button onClick={() => { setStep("form"); setFlash(""); setPatientId(null); setPflegeperson(""); }}
            className="mt-4 rounded-xl bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Neuen Antrag stellen
          </button>
        </div>
      )}
    </div>
  );
}
