"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminContract,
  SignatureEvent,
  getAdminContract,
  getAdminContracts,
} from "@/lib/api";
import { useRequireOffice } from "@/lib/use-require-role";
import {
  AlertCircleIcon,
  RefreshIcon,
  ShieldIcon,
} from "@/components/icons";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function AdminContractsPage() {
  const { authorized, isLoading } = useRequireOffice();
  const [refreshing, setRefreshing] = useState(false);
  const [contracts, setContracts] = useState<AdminContract[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<SignatureEvent | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pageError, setPageError] = useState("");

  const loadData = useCallback(async () => {
    setRefreshing(true);
    setPageError("");
    try {
      const data = await getAdminContracts();
      setContracts(data);
      if (selectedId == null && data.length > 0) {
        setSelectedId(data[0].id);
      }
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Fehler beim Laden"
      );
    } finally {
      setRefreshing(false);
    }
  }, [selectedId]);

  useEffect(() => {
    if (authorized) void loadData();
  }, [authorized, loadData]);

  useEffect(() => {
    if (selectedId == null) {
      setSelected(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    getAdminContract(selectedId)
      .then((e) => {
        if (!cancelled) setSelected(e);
      })
      .catch((err) => {
        if (!cancelled) {
          setPageError(
            err instanceof Error ? err.message : "Fehler beim Laden des Vertrags"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return contracts;
    return contracts.filter(
      (c) =>
        (c.patient_name ?? "").toLowerCase().includes(needle) ||
        c.signer_name.toLowerCase().includes(needle) ||
        String(c.patient_id).includes(needle)
    );
  }, [contracts, search]);

  function handlePrint(id: number) {
    window.open(`/admin/contracts/${id}/print`, "_blank");
  }

  if (isLoading || !authorized) {
    return (
      <div className="space-y-6">
        <div className="h-32 animate-pulse rounded-3xl bg-white/60" />
        <div className="h-96 animate-pulse rounded-3xl bg-white/60" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Dokumente
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              Betreuungsverträge
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {filtered.length} von {contracts.length} Verträgen
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Patient oder Unterzeichner …"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-brand-400"
            />
            <button
              onClick={loadData}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshIcon
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              Aktualisieren
            </button>
          </div>
        </div>
      </div>

      {pageError && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircleIcon className="h-5 w-5 shrink-0" />
          {pageError}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Alle Verträge
          </h2>
          {filtered.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
              <ShieldIcon className="mb-2 h-8 w-8" />
              Noch keine Betreuungsverträge erfasst.
            </div>
          ) : (
            <div className="max-h-[640px] space-y-2 overflow-y-auto pr-1">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                    selectedId === c.id
                      ? "border-brand-300 bg-brand-50/50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500 text-white">
                    <ShieldIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {c.patient_name ?? `Patient #${c.patient_id}`}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      Unterzeichner: {c.signer_name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {formatDate(c.signed_at)} · {c.source}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Vertrags-Details
            </h2>
            {selectedId != null && (
              <button
                onClick={() => handlePrint(selectedId)}
                className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-brand-900/20 transition hover:bg-brand-700"
              >
                PDF / Drucken
              </button>
            )}
          </div>

          {detailLoading ? (
            <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
          ) : !selected ? (
            <p className="text-sm text-slate-500">
              Wähle links einen Vertrag aus.
            </p>
          ) : (
            <div className="space-y-5">
              <div className="grid place-items-center rounded-2xl bg-gradient-to-br from-slate-50 to-brand-50/40 p-6">
                {selected.asset?.svg_content ? (
                  <div
                    className="w-full max-w-[480px] [&>svg]:h-auto [&>svg]:w-full"
                    dangerouslySetInnerHTML={{
                      __html: selected.asset.svg_content,
                    }}
                  />
                ) : (
                  <p className="text-sm text-slate-400">Keine SVG vorhanden.</p>
                )}
              </div>

              <dl className="grid gap-3 sm:grid-cols-2">
                <DetailRow label="Patient ID" value={`#${selected.patient_id}`} />
                <DetailRow label="Unterzeichner" value={selected.signer_name} />
                <DetailRow label="Status" value={selected.status} />
                <DetailRow label="Quelle" value={selected.source} />
                <DetailRow
                  label="Info-Version"
                  value={selected.info_text_version ?? "—"}
                />
                <DetailRow
                  label="Unterschrieben"
                  value={formatDate(selected.signed_at)}
                />
                <DetailRow label="Notiz" value={selected.note ?? "—"} />
              </dl>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50/70 px-3 py-2.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-700">{value}</dd>
    </div>
  );
}
