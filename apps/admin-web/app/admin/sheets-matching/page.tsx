"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SheetsPreviewRow,
  User,
  getMe,
  getUsers,
  getSheetsPreview,
  linkUserToSheet,
  runSheetsSync,
} from "@/lib/api";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  RefreshIcon,
} from "@/components/icons";

export default function SheetsMatchingPage() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);
  const [rows, setRows] = useState<SheetsPreviewRow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selections, setSelections] = useState<Record<string, number>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [preview, allUsers] = await Promise.all([
        getSheetsPreview(),
        getUsers(),
      ]);
      setRows(preview);
      setUsers(allUsers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

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
    } finally {
      setBooting(false);
    }
  }, [loadData, router]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  async function handleLink(sheetName: string, userId: number) {
    setError("");
    setFlash("");
    try {
      await linkUserToSheet(userId, sheetName);
      setFlash(`„${sheetName}" → User #${userId} verknüpft.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function handleSyncAll() {
    setSyncing(true);
    setError("");
    setFlash("");
    try {
      const r = await runSheetsSync();
      setFlash(
        `Sync OK: ${r.matched} gematched, ${r.unmatched_sheet_names.length} ohne Treffer.`
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSyncing(false);
    }
  }

  if (booting) {
    return <div className="h-64 animate-pulse rounded-3xl bg-white/60" />;
  }

  const linked = rows.filter((r) => r.linked_user_id !== null);
  const unlinked = rows.filter((r) => r.linked_user_id === null);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Google Sheets
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              Stundenübersicht Matching
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {linked.length} verknüpft · {unlinked.length} offen · Sheet-Namen
              manuell mit Usern verknüpfen, dann Sync auslösen.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSyncAll}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
            >
              <RefreshIcon
                className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
              />
              {syncing ? "Synchronisiere …" : "📊 Sync auslösen"}
            </button>
            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshIcon
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
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

      {unlinked.length > 0 && (
        <section className="rounded-3xl border border-amber-200 bg-amber-50/50 p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Nicht verknüpft ({unlinked.length})
          </h2>
          <div className="space-y-2">
            {unlinked.map((row) => (
              <div
                key={row.sheet_name}
                className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {row.sheet_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    Saldo:{" "}
                    <span
                      className={
                        row.overtime_balance_hours != null &&
                        row.overtime_balance_hours >= 0
                          ? "text-emerald-700"
                          : "text-red-700"
                      }
                    >
                      {row.overtime_balance_hours != null
                        ? `${row.overtime_balance_hours >= 0 ? "+" : ""}${row.overtime_balance_hours.toFixed(1)} h`
                        : "—"}
                    </span>
                    {" · "}h/Wo: {row.target_hours_per_week ?? "—"}
                    {row.best_match_user_name && (
                      <span className="ml-2 text-blue-700">
                        Vorschlag: {row.best_match_user_name} (
                        {(row.best_match_score * 100).toFixed(0)}%)
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selections[row.sheet_name] ?? ""}
                    onChange={(e) =>
                      setSelections((s) => ({
                        ...s,
                        [row.sheet_name]: Number(e.target.value),
                      }))
                    }
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
                  >
                    <option value="">User wählen …</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.email})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const uid = selections[row.sheet_name];
                      if (uid) handleLink(row.sheet_name, uid);
                    }}
                    disabled={!selections[row.sheet_name]}
                    className="inline-flex items-center rounded-2xl bg-brand-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-40"
                  >
                    Verknüpfen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {linked.length > 0 && (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50/30 p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Verknüpft ({linked.length})
          </h2>
          <div className="space-y-2">
            {linked.map((row) => (
              <div
                key={row.sheet_name}
                className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-white p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {row.sheet_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    → {row.linked_user_name} · Saldo:{" "}
                    <span
                      className={
                        row.overtime_balance_hours != null &&
                        row.overtime_balance_hours >= 0
                          ? "text-emerald-700"
                          : "text-red-700"
                      }
                    >
                      {row.overtime_balance_hours != null
                        ? `${row.overtime_balance_hours >= 0 ? "+" : ""}${row.overtime_balance_hours.toFixed(1)} h`
                        : "—"}
                    </span>
                    {" · "}h/Wo: {row.target_hours_per_week ?? "—"}
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                  Verknüpft
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
