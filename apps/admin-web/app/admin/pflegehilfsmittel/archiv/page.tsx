"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { User, getMe } from "@/lib/api";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";
import { AlertCircleIcon, RefreshIcon } from "@/components/icons";

type ArchivEntry = {
  patient_id: number;
  patient_name: string;
  abrechnungen_count: number;
  last_abrechnung: string | null;
  total_betrag: number;
};

function formatEuro(val: number): string {
  return val.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default function ArchivPage() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);
  const [entries, setEntries] = useState<ArchivEntry[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  const loadData = useCallback(async () => {
    setError("");
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/pflegehilfsmittel/archiv`,
        { headers: buildHeaders() }
      );
      if (!res.ok) throw new Error("Fehler beim Laden");
      setEntries(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me: User = await getMe();
        if (me.role !== "admin" && me.role !== "buero" && me.role !== "standortleiter") {
          router.replace("/user");
          return;
        }
        await loadData();
      } catch {
        router.replace("/");
        return;
      } finally {
        setBooting(false);
      }
    })();
  }, [loadData, router]);

  const filtered = entries.filter((e) => {
    if (!filter) return true;
    return e.patient_name.toLowerCase().includes(filter.toLowerCase());
  });

  if (booting) return <div className="h-64 animate-pulse rounded-3xl bg-white/60" />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Pflegehilfsmittel
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              Archiv
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Alle Patienten mit Abrechnungs-Uebersicht und Dokumenten-Downloads.
            </p>
          </div>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <RefreshIcon className="h-4 w-4" />
            Aktualisieren
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircleIcon className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {/* Filter */}
      {entries.length > 0 && (
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Patient suchen..."
          className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm sm:w-64 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      )}

      {/* Patient List */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Patienten ({filtered.length})
        </h2>
        {filtered.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
            {entries.length === 0
              ? "Noch keine Abrechnungen vorhanden."
              : "Keine Patienten fuer diesen Filter."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                  <th className="px-3 py-3">Patient</th>
                  <th className="px-3 py-3">Abrechnungen</th>
                  <th className="px-3 py-3">Gesamtbetrag</th>
                  <th className="px-3 py-3">Letzte Abrechnung</th>
                  <th className="px-3 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.patient_id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-medium text-slate-900">{e.patient_name}</td>
                    <td className="px-3 py-3 text-slate-600">{e.abrechnungen_count}</td>
                    <td className="px-3 py-3 font-semibold text-slate-700">
                      {formatEuro(e.total_betrag)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {e.last_abrechnung
                        ? new Date(e.last_abrechnung).toLocaleDateString("de-DE")
                        : "\u2014"}
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/admin/pflegehilfsmittel/archiv/${e.patient_id}`}
                        className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
                      >
                        Ansehen
                      </Link>
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
