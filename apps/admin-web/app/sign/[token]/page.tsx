"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import SignatureCanvas from "@/components/signature-canvas";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.froehlichdienste.de";

type SignatureData = {
  patient_name: string;
  description: string;
  document_type: string;
  status: string;
  expired: boolean;
};

export default function RemoteSignPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SignatureData | null>(null);
  const [error, setError] = useState("");
  const [signerName, setSignerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/public/sign/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error("not_found");
        return r.json();
      })
      .then((d: SignatureData) => setData(d))
      .catch(() => setError("Link nicht gefunden oder ungueltig."))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSignature(svg: string) {
    if (!signerName.trim()) {
      setError("Bitte geben Sie Ihren Namen ein.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/public/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signer_name: signerName.trim(),
          svg_content: svg,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Fehler beim Unterschreiben.");
      }
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSubmitting(false);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-violet-600" />
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-slate-50 p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-10 w-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            Vielen Dank fuer Ihre Unterschrift!
          </h1>
          <p className="text-sm text-slate-500">
            Ihre Unterschrift wurde gespeichert. Sie koennen dieses Fenster jetzt schliessen.
          </p>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Die Leistung wurde dokumentiert und bestaetigt.
          </div>
        </div>
      </div>
    );
  }

  // Error: not found or invalid
  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="w-full max-w-md space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Link nicht gefunden</h1>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  // Already signed
  if (data.status === "signed") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="w-full max-w-md space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Bereits unterschrieben</h1>
          <p className="text-sm text-slate-500">
            Diese Leistung wurde bereits unterschrieben. Sie koennen dieses Fenster schliessen.
          </p>
        </div>
      </div>
    );
  }

  // Expired
  if (data.expired || data.status === "expired") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="w-full max-w-md space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Link abgelaufen</h1>
          <p className="text-sm text-slate-500">
            Dieser Signatur-Link ist leider abgelaufen. Bitte kontaktieren Sie Ihren Betreuer
            fuer einen neuen Link.
          </p>
        </div>
      </div>
    );
  }

  // Main signing view
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
              <svg className="h-5 w-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Unterschrift</h1>
              <p className="text-xs text-slate-500">Froehlich Dienste</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-lg flex-1 space-y-4 p-4">
        {/* Info card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Patient
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {data.patient_name}
          </p>
          <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Leistung
            </p>
            <p className="mt-1 text-sm font-medium text-slate-700">
              {data.description}
            </p>
          </div>
        </div>

        {/* Signer name input */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Ihr Name
          </label>
          <input
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Vor- und Nachname"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-base outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </div>

        {/* Signature canvas */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Unterschrift
          </p>
          <SignatureCanvas
            onSignature={handleSignature}
            width={380}
            height={180}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {submitting && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-violet-600" />
            Unterschrift wird gespeichert…
          </div>
        )}

        {/* Legal note */}
        <p className="px-2 text-center text-[10px] leading-relaxed text-slate-400">
          Mit Ihrer Unterschrift bestaetigen Sie die Richtigkeit der erbrachten
          Leistungen und willigen in die Speicherung der Daten (Name,
          Unterschrift, Zeitpunkt) zur Dokumentation ein.
        </p>
      </div>
    </div>
  );
}
