"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, getMe } from "@/lib/api";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";
import { AlertCircleIcon, CheckCircleIcon, RefreshIcon } from "@/components/icons";

type Kostentraeger = {
  id: number;
  name: string;
  ik: string;
  annahmestelle: string | null;
  email: string | null;
};

export default function KassenPage() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);
  const [items, setItems] = useState<Kostentraeger[]>([]);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [importing, setImporting] = useState(false);

  const loadData = useCallback(async () => {
    setError("");
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/pflegehilfsmittel/kostentraeger`,
        { headers: buildHeaders() }
      );
      if (res.ok) setItems(await res.json());
      else throw new Error("Fehler beim Laden");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
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

  async function handleImport() {
    setImporting(true);
    setError("");
    setFlash("");
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/pflegehilfsmittel/kostentraeger/import`,
        { method: "POST", headers: buildHeaders() }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Import fehlgeschlagen");
      }
      const data = await res.json();
      setFlash(`Import erfolgreich: ${data.imported ?? 0} Kostentraeger importiert.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setImporting(false);
    }
  }

  if (booting) return <div className="h-64 animate-pulse rounded-3xl bg-white/60" />;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Pflegehilfsmittel
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              Kostentraeger / Kassen
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {items.length} Kostentraeger konfiguriert
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleImport}
              disabled={importing}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
            >
              {importing ? "Importiere..." : "KE0 Import"}
            </button>
            <button
              onClick={loadData}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
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

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {items.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
            Keine Kostentraeger vorhanden. Nutze den KE0 Import.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">IK</th>
                  <th className="px-3 py-3">Annahmestelle</th>
                  <th className="px-3 py-3">Email</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-medium text-slate-900">{item.name}</td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-600">{item.ik}</td>
                    <td className="px-3 py-3 text-slate-600">{item.annahmestelle ?? "\u2014"}</td>
                    <td className="px-3 py-3 text-slate-600">{item.email ?? "\u2014"}</td>
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
