"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRequireRole } from "@/lib/use-require-role";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";
import { AlertCircleIcon, CheckCircleIcon, RefreshIcon } from "@/components/icons";

type Position = {
  id: number;
  bezeichnung: string | null;
  menge: number;
  einzelpreis: number;
  betrag_gesamt: number;
};

type Abrechnung = {
  id: number;
  patient_name: string;
  versichertennummer: string;
  geburtsdatum: string;
  kasse_name: string | null;
  abrechnungsmonat: string;
  gesamt_betrag: number;
  status: string;
  gesendet_am: string | null;
  created_at: string | null;
  leistungsnachweis_path: string | null;
  positionen: Position[];
};

type Patient = {
  id: number;
  name: string;
  versichertennummer: string;
  geburtsdatum: string | null;
  kasse_name: string | null;
  unterschriebener_antrag: string | null;
};

function formatEuro(val: number): string {
  return val.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    entwurf: "bg-amber-100 text-amber-800",
    gesendet: "bg-emerald-100 text-emerald-800",
    storniert: "bg-red-100 text-red-800",
  };
  return map[status] ?? "bg-slate-100 text-slate-800";
}

export default function ArchivDetailPage() {
  const { isLoading: authLoading, authorized } = useRequireRole(["admin", "pflegehilfsmittel"]);
  const params = useParams();
  const patientId = params.patientId as string;

  const [patient, setPatient] = useState<Patient | null>(null);
  const [abrechnungen, setAbrechnungen] = useState<Abrechnung[]>([]);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setError("");
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/pflegehilfsmittel/archiv/${patientId}`,
        { headers: buildHeaders() }
      );
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setPatient(data.patient);
      setAbrechnungen(data.abrechnungen);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    }
  }, [patientId]);

  useEffect(() => {
    if (authorized) void loadData();
  }, [authorized, loadData]);

  async function handleLeistungsnachweisUpload(abrId: number, file: File) {
    setBusyId(abrId);
    setError("");
    setFlash("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/pflegehilfsmittel/abrechnungen/${abrId}/leistungsnachweis-upload`,
        { method: "POST", body: fd }
      );
      if (!res.ok) throw new Error("Upload fehlgeschlagen");
      setFlash("Leistungsnachweis erfolgreich hochgeladen!");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading || !authorized) return <div className="h-64 animate-pulse rounded-3xl bg-white/60" />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Pflegehilfsmittel &middot; Archiv
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              {patient?.name ?? "Patient"}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {patient?.versichertennummer ?? ""} &middot; {patient?.kasse_name ?? ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/pflegehilfsmittel/archiv"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Zurueck
            </Link>
            <button
              onClick={loadData}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <RefreshIcon className="h-4 w-4" />
              Aktualisieren
            </button>
          </div>
        </div>
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

      {/* Patient-Level Downloads */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Patienten-Dokumente</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() =>
              window.open(
                `${API_BASE_URL}/admin/pflegehilfsmittel/patients/${patientId}/pflegeantrag.pdf`,
                "_blank"
              )
            }
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            Pflegeantrag PDF
          </button>
          <button
            onClick={() =>
              window.open(
                `${API_BASE_URL}/admin/pflegehilfsmittel/patients/${patientId}/unterschrift-eins.pdf`,
                "_blank"
              )
            }
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            Unterschrift Eins PDF
          </button>
          <button
            onClick={() =>
              window.open(
                `${API_BASE_URL}/admin/pflegehilfsmittel/patients/${patientId}/antrag-kasse.pdf`,
                "_blank"
              )
            }
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            Antrag Kasse PDF
          </button>
          <button
            onClick={() =>
              window.open(
                `${API_BASE_URL}/admin/pflegehilfsmittel/patients/${patientId}/antrag-komplett.pdf`,
                "_blank"
              )
            }
            className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
          >
            Antrag Komplett PDF
          </button>
          {patient?.unterschriebener_antrag && (
            <>
              <button
                onClick={() =>
                  window.open(
                    `${API_BASE_URL}/admin/pflegehilfsmittel/patients/${patientId}/antrag-download`,
                    "_blank"
                  )
                }
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
              >
                Unterschriebener Antrag
              </button>
              <button
                onClick={() =>
                  window.open(
                    `${API_BASE_URL}/admin/pflegehilfsmittel/patients/${patientId}/antrag-final.pdf`,
                    "_blank"
                  )
                }
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
              >
                Antrag Final PDF
              </button>
            </>
          )}
        </div>
      </section>

      {/* Abrechnungen */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Abrechnungen ({abrechnungen.length})
        </h2>
        {abrechnungen.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
            Keine Abrechnungen vorhanden.
          </div>
        ) : (
          <div className="space-y-4">
            {abrechnungen.map((abr) => (
              <div
                key={abr.id}
                className="rounded-2xl border border-slate-100 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-900">
                      #{abr.id} &middot; {abr.abrechnungsmonat}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusBadge(abr.status)}`}
                    >
                      {abr.status}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-slate-700">
                    {formatEuro(abr.gesamt_betrag)}
                  </span>
                </div>

                {/* Positionen */}
                {abr.positionen.length > 0 && (
                  <div className="mb-3 text-xs text-slate-500">
                    {abr.positionen.map((p) => (
                      <span key={p.id} className="mr-3">
                        {p.bezeichnung} x{p.menge} ({formatEuro(p.betrag_gesamt)})
                      </span>
                    ))}
                  </div>
                )}

                {/* Meta */}
                <div className="mb-3 text-xs text-slate-500">
                  {abr.gesendet_am && (
                    <span className="mr-4">
                      Gesendet: {new Date(abr.gesendet_am).toLocaleString("de-DE")}
                    </span>
                  )}
                  {abr.created_at && (
                    <span>
                      Erstellt: {new Date(abr.created_at).toLocaleString("de-DE")}
                    </span>
                  )}
                </div>

                {/* Downloads */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() =>
                      window.open(
                        `${API_BASE_URL}/admin/pflegehilfsmittel/abrechnungen/${abr.id}/pdf`,
                        "_blank"
                      )
                    }
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    Rechnung PDF
                  </button>
                  <button
                    onClick={() =>
                      window.open(
                        `${API_BASE_URL}/admin/pflegehilfsmittel/abrechnungen/${abr.id}/edifact`,
                        "_blank"
                      )
                    }
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    EDIFACT
                  </button>
                  <button
                    onClick={() =>
                      window.open(
                        `${API_BASE_URL}/admin/pflegehilfsmittel/abrechnungen/${abr.id}/begleitzettel.pdf`,
                        "_blank"
                      )
                    }
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    Begleitzettel
                  </button>
                  <button
                    onClick={() =>
                      window.open(
                        `${API_BASE_URL}/admin/pflegehilfsmittel/abrechnungen/${abr.id}/antrag-kasse.pdf`,
                        "_blank"
                      )
                    }
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    Antrag Kasse
                  </button>

                  {/* Leistungsnachweis */}
                  {abr.leistungsnachweis_path ? (
                    <button
                      onClick={() =>
                        window.open(
                          `${API_BASE_URL}/admin/pflegehilfsmittel/abrechnungen/${abr.id}/leistungsnachweis.pdf`,
                          "_blank"
                        )
                      }
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
                    >
                      Leistungsnachweis
                    </button>
                  ) : (
                    <label className="cursor-pointer rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100">
                      {busyId === abr.id ? "Lade hoch..." : "Leistungsnachweis hochladen"}
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        disabled={busyId === abr.id}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleLeistungsnachweisUpload(abr.id, file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
