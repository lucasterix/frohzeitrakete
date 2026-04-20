"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";
import SignatureCanvas from "@/components/signature-canvas";
import { AlertCircleIcon, CheckCircleIcon } from "@/components/icons";

type Patient = {
  id: number;
  display_name: string;
  first_name: string;
  last_name: string;
};

export default function PflegehilfsmittelSignaturPageWrapper() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-white/60" />}>
      <PflegehilfsmittelSignaturPage />
    </Suspense>
  );
}

function PflegehilfsmittelSignaturPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedPatient = searchParams.get("patient");

  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number | "">(
    preselectedPatient ? Number(preselectedPatient) : ""
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [step, setStep] = useState<"select" | "sign" | "done">(
    preselectedPatient ? "sign" : "select"
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithRefresh(`${API_BASE_URL}/mobile/patients`, {
          headers: buildHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setPatients(data);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  async function handleSignature(svgContent: string) {
    if (!selectedPatientId) {
      setError("Bitte Patient waehlen");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetchWithRefresh(`${API_BASE_URL}/mobile/signatures`, {
        method: "POST",
        headers: { ...buildHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: selectedPatientId,
          document_type: "pflegeantrag_hilfsmittel",
          signer_name: patients.find((p) => p.id === selectedPatientId)?.display_name ?? "Patient",
          svg_content: svgContent,
          note: "Pflegehilfsmittel-Antrag unterschrieben",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Unterschrift fehlgeschlagen");
      }
      setSuccess("Unterschrift erfolgreich gespeichert!");
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="h-64 animate-pulse rounded-2xl bg-white/60" />;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          Pflegehilfsmittel-Antrag
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Patient unterschreibt den Pflegehilfsmittel-Antrag digital.
        </p>
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

      {step === "select" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Patient waehlen</h2>
          <select
            value={selectedPatientId}
            onChange={(e) => setSelectedPatientId(e.target.value ? Number(e.target.value) : "")}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">Bitte waehlen...</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name || `${p.first_name} ${p.last_name}`}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              if (selectedPatientId) setStep("sign");
              else setError("Bitte Patient waehlen");
            }}
            className="mt-4 w-full rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Weiter zur Unterschrift
          </button>
        </div>
      )}

      {step === "sign" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Unterschrift des Patienten
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Der Patient bestaetigt hiermit den Empfang der Pflegehilfsmittel.
          </p>
          {submitting ? (
            <div className="py-8 text-center text-sm text-slate-400">Wird gespeichert...</div>
          ) : (
            <SignatureCanvas onSignature={handleSignature} />
          )}
          <button
            onClick={() => setStep("select")}
            className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Zurueck
          </button>
        </div>
      )}

      {step === "done" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <p className="text-lg font-semibold text-emerald-800">Erfolgreich unterschrieben!</p>
          <button
            onClick={() => router.push("/user/patienten")}
            className="mt-4 rounded-2xl bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Zurueck zur Patientenliste
          </button>
        </div>
      )}
    </div>
  );
}
