"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SyncError,
  User,
  getMe,
  getSyncErrors,
  resolveSyncError,
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

export default function SyncErrorsPage() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<SyncError[]>([]);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const loadData = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      setItems(await getSyncErrors(onlyOpen));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setRefreshing(false);
    }
  }, [onlyOpen]);

  const bootstrap = useCallback(async () => {
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
  }, [loadData, router]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!booting) void loadData();
  }, [onlyOpen, booting, loadData]);

  async function handleResolve(id: number) {
    setError("");
    setFlash("");
    try {
      await resolveSyncError(id);
      setFlash(`Fehler #${id} als erledigt markiert.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
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
              Backend
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              Sync-Fehler
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {items.length} Einträge · Patti-Writes die nicht
              durchkamen. Büro kann die manuell nachziehen und dann
              abhaken.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setOnlyOpen(true)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                onlyOpen
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              Offen
            </button>
            <button
              onClick={() => setOnlyOpen(false)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                !onlyOpen
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
            Keine Einträge mit diesem Filter.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((e) => {
              const done = e.resolved_at !== null;
              return (
                <li
                  key={e.id}
                  className={`rounded-2xl border p-4 ${
                    done
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-red-200 bg-red-50/40"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                          {e.kind}
                        </span>
                        {e.user_id && (
                          <span className="text-xs text-slate-600">
                            User #{e.user_id}
                          </span>
                        )}
                        {e.patient_id && (
                          <span className="text-xs text-slate-600">
                            Patient #{e.patient_id}
                          </span>
                        )}
                        {e.year && e.month && (
                          <span className="text-xs text-slate-600">
                            {e.year}-{String(e.month).padStart(2, "0")}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-all text-xs text-slate-700">
                        {e.message}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {formatDateTime(e.created_at)}
                      </p>
                    </div>
                    {!done && (
                      <button
                        onClick={() => handleResolve(e.id)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        ✓ Erledigt
                      </button>
                    )}
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
