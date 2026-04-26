"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRequireRole } from "@/lib/use-require-role";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";
import { AlertCircleIcon, RefreshIcon } from "@/components/icons";

type Abrechnung = {
  id: number;
  patient_name: string;
  patient_id: number | null;
  monat: string;
  betrag_cent: number;
  status: string;
  created_at: string;
};

function formatEuro(cent: number): string {
  return (cent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    entwurf: "bg-amber-100 text-amber-800",
    gesendet: "bg-emerald-100 text-emerald-800",
    storniert: "bg-red-100 text-red-800",
  };
  return map[status] ?? "bg-slate-100 text-slate-800";
}

export default function AbrechnungenPage() {
  const { isLoading: authLoading, authorized } = useRequireRole(["admin", "pflegehilfsmittel"]);
  const [items, setItems] = useState<Abrechnung[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [monatFilter, setMonatFilter] = useState<string>("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "alle") params.set("status", statusFilter);
      if (monatFilter) params.set("monat", monatFilter);
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/pflegehilfsmittel/abrechnungen?${params.toString()}`,
        { headers: buildHeaders() }
      );
      if (res.ok) setItems(await res.json());
      else throw new Error("Fehler beim Laden");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  }, [statusFilter, monatFilter]);

  useEffect(() => {
    if (authorized) void loadData();
  }, [authorized, loadData]);

  useEffect(() => {
    if (authorized) void loadData();
  }, [statusFilter, monatFilter, authorized, loadData]);

  async function handleAction(id: number, action: "pdf" | "edifact" | "senden" | "storno") {
    setBusyId(id);
    setError("");
    try {
      if (action === "pdf") {
        window.open(`${API_BASE_URL}/admin/pflegehilfsmittel/abrechnungen/${id}/pdf`, "_blank");
      } else if (action === "edifact") {
        window.open(`${API_BASE_URL}/admin/pflegehilfsmittel/abrechnungen/${id}/edifact`, "_blank");
      } else if (action === "senden") {
        const res = await fetchWithRefresh(
          `${API_BASE_URL}/admin/pflegehilfsmittel/abrechnungen/${id}/senden`,
          { method: "POST", headers: buildHeaders() }
        );
        if (!res.ok) throw new Error("Senden fehlgeschlagen");
        await loadData();
      } else if (action === "storno") {
        if (!confirm("Abrechnung wirklich stornieren?")) return;
        const res = await fetchWithRefresh(
          `${API_BASE_URL}/admin/pflegehilfsmittel/abrechnungen/${id}/storno`,
          { method: "POST", headers: buildHeaders() }
        );
        if (!res.ok) throw new Error("Storno fehlgeschlagen");
        await loadData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading || !authorized) return <div className="h-64 animate-pulse rounded-3xl bg-white/60" />;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Pflegehilfsmittel
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              Abrechnungen
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {items.length} Abrechnungen gefunden
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm"
            >
              <option value="alle">Alle Status</option>
              <option value="entwurf">Entwurf</option>
              <option value="gesendet">Gesendet</option>
              <option value="storniert">Storniert</option>
            </select>
            <input
              type="month"
              value={monatFilter}
              onChange={(e) => setMonatFilter(e.target.value)}
              className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm"
            />
            <Link
              href="/admin/pflegehilfsmittel/abrechnungen/neu"
              className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
            >
              + Neue Abrechnung
            </Link>
            <button
              onClick={loadData}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshIcon className="h-4 w-4" />
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

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {items.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
            Keine Abrechnungen mit diesem Filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                  <th className="px-3 py-3">Patient</th>
                  <th className="px-3 py-3">Monat</th>
                  <th className="px-3 py-3">Betrag</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Downloads</th>
                  <th className="px-3 py-3">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-medium text-slate-900">{item.patient_name}</td>
                    <td className="px-3 py-3 text-slate-600">{item.monat}</td>
                    <td className="px-3 py-3 font-semibold text-slate-700">{formatEuro(item.betrag_cent)}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusBadge(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() => handleAction(item.id, "pdf")}
                          disabled={busyId === item.id}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                        >
                          Rechnung PDF
                        </button>
                        <button
                          onClick={() => handleAction(item.id, "edifact")}
                          disabled={busyId === item.id}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                        >
                          EDIFACT
                        </button>
                        {item.patient_id && (
                          <button
                            onClick={() =>
                              window.open(
                                `${API_BASE_URL}/admin/pflegehilfsmittel/patients/${item.patient_id}/pflegeantrag`,
                                "_blank"
                              )
                            }
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                          >
                            Pflegeantrag PDF
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {item.status === "entwurf" && (
                          <button
                            onClick={() => handleAction(item.id, "senden")}
                            disabled={busyId === item.id}
                            className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-200 disabled:opacity-50"
                          >
                            Senden
                          </button>
                        )}
                        {item.status !== "storniert" && (
                          <button
                            onClick={() => handleAction(item.id, "storno")}
                            disabled={busyId === item.id}
                            className="rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                          >
                            Storno
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
