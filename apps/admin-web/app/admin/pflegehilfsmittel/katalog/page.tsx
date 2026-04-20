"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, getMe } from "@/lib/api";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";
import { AlertCircleIcon, CheckCircleIcon, RefreshIcon } from "@/components/icons";

type Hilfsmittel = {
  id: number;
  bezeichnung: string;
  positionsnr: string;
  packungsgroesse: number;
  preis_cent: number;
};

function formatEuro(cent: number): string {
  return (cent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default function KatalogPage() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);
  const [items, setItems] = useState<Hilfsmittel[]>([]);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editPreis, setEditPreis] = useState("");
  const [editPackung, setEditPackung] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setError("");
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/pflegehilfsmittel/hilfsmittel`,
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

  function startEdit(item: Hilfsmittel) {
    setEditId(item.id);
    setEditPreis((item.preis_cent / 100).toFixed(2));
    setEditPackung(String(item.packungsgroesse));
  }

  async function saveEdit(id: number) {
    setSaving(true);
    setError("");
    setFlash("");
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/pflegehilfsmittel/hilfsmittel/${id}`,
        {
          method: "PATCH",
          headers: { ...buildHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            preis_cent: Math.round(parseFloat(editPreis) * 100),
            packungsgroesse: parseInt(editPackung) || 1,
          }),
        }
      );
      if (!res.ok) throw new Error("Speichern fehlgeschlagen");
      setFlash("Gespeichert!");
      setEditId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
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
              Hilfsmittel-Katalog
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {items.length} Positionen im Katalog
            </p>
          </div>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
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
      {flash && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircleIcon className="h-5 w-5 shrink-0" />
          {flash}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {items.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
            Keine Hilfsmittel im Katalog.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                  <th className="px-3 py-3">Bezeichnung</th>
                  <th className="px-3 py-3">Positionsnr.</th>
                  <th className="px-3 py-3">Packung</th>
                  <th className="px-3 py-3">Preis</th>
                  <th className="px-3 py-3">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-medium text-slate-900">{item.bezeichnung}</td>
                    <td className="px-3 py-3 text-slate-600">{item.positionsnr}</td>
                    <td className="px-3 py-3">
                      {editId === item.id ? (
                        <input
                          type="number"
                          value={editPackung}
                          onChange={(e) => setEditPackung(e.target.value)}
                          className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                        />
                      ) : (
                        <span className="text-slate-600">{item.packungsgroesse} Stk.</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {editId === item.id ? (
                        <input
                          type="text"
                          value={editPreis}
                          onChange={(e) => setEditPreis(e.target.value)}
                          className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                          placeholder="0.00"
                        />
                      ) : (
                        <span className="font-semibold text-slate-700">{formatEuro(item.preis_cent)}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {editId === item.id ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => saveEdit(item.id)}
                            disabled={saving}
                            className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                          >
                            Speichern
                          </button>
                          <button
                            onClick={() => setEditId(null)}
                            className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50"
                          >
                            Abbrechen
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(item)}
                          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Bearbeiten
                        </button>
                      )}
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
