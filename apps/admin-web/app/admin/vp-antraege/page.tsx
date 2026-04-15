"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminVpAntrag,
  User,
  getMe,
  getVpAntraege,
  setOfficeProcessed,
  vpAntragPdfUrl,
} from "@/lib/api";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  RefreshIcon,
} from "@/components/icons";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function VpAntraegePage() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<AdminVpAntrag[]>([]);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const data = await getVpAntraege(filter === "open");
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setRefreshing(false);
    }
  }, [filter]);

  const bootstrap = useCallback(async () => {
    try {
      const me: User = await getMe();
      if (me.role !== "admin") {
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
  }, [loadData, router]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!booting) void loadData();
  }, [filter, booting, loadData]);

  async function toggleProcessed(item: AdminVpAntrag) {
    setBusyId(item.id);
    setError("");
    setFlash("");
    try {
      const newState = item.office_processed_at === null;
      await setOfficeProcessed(item.id, newState);
      setFlash(
        newState
          ? `VP-Antrag von ${item.patient_name ?? "Patient"} als bearbeitet markiert.`
          : `Bearbeitungs-Markierung zurückgenommen.`
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusyId(null);
    }
  }

  if (booting) {
    return <div className="h-64 animate-pulse rounded-3xl bg-white/60" />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Krankenkasse
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              Verhinderungspflege-Anträge
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {items.length} Anträge · zieht das fertig ausgefüllte PDF aus
              Patti, mit Pflegeperson und Patient-Unterschrift.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFilter("open")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                filter === "open"
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              Offen
            </button>
            <button
              onClick={() => setFilter("all")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                filter === "all"
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              Alle
            </button>
            <button
              onClick={loadData}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshIcon
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
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
            Keine VP-Anträge mit diesem Filter.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              const done = item.office_processed_at !== null;
              return (
                <li
                  key={item.id}
                  className={`rounded-2xl border p-4 transition ${
                    done
                      ? "border-emerald-200 bg-emerald-50/50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-slate-900">
                          {item.patient_name ?? `Patient #${item.patient_id}`}
                        </span>
                        {done && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                            Bearbeitet
                          </span>
                        )}
                        {item.approved_by_kk && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-800">
                            KK genehmigt
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        Pflegeperson:{" "}
                        <strong>{item.pflegeperson ?? "—"}</strong>
                      </p>
                      <p className="text-xs text-slate-500">
                        Unterschrieben am {formatDateTime(item.signed_at)}
                        {item.note ? ` · ${item.note}` : ""}
                      </p>
                      {done && (
                        <p className="text-[11px] italic text-slate-500">
                          Bearbeitet am{" "}
                          {formatDateTime(item.office_processed_at)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={vpAntragPdfUrl(item.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-brand-700"
                      >
                        Antrag PDF ↗
                      </a>
                      <button
                        onClick={() => toggleProcessed(item)}
                        disabled={busyId === item.id}
                        className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium transition disabled:opacity-60 ${
                          done
                            ? "border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {busyId === item.id
                          ? "Speichere …"
                          : done
                            ? "↶ Zurücksetzen"
                            : "✓ Als bearbeitet"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
