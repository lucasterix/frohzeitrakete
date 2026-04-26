"use client";

import { useMemo, useState } from "react";
import {
  AdminCallTask,
  AdminCallTaskKind,
  getAdminCallTasks,
  markCallRequestDone,
  markOfficeCallDone,
} from "@/lib/api";
import { useRequireOffice } from "@/lib/use-require-role";
import { useCachedFetch } from "@/lib/use-cached-fetch";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  InboxIcon,
  PhoneIcon,
  RefreshIcon,
} from "@/components/icons";

const KIND_LABELS: Record<AdminCallTaskKind, string> = {
  call_request: "Rückruf-Anfrage",
  new_caretaker_followup: "Neuer Hauptbetreuer",
  half_year_check: "Halbjahres-Check",
  no_invoice_2_months: "Kein Einsatz seit 2 Monaten",
  missing_emergency_contact: "Notfallkontakt fehlt",
  missing_contract: "Betreuungsvertrag fehlt",
};

const PRIORITY_STYLE: Record<AdminCallTask["priority"], string> = {
  high: "bg-red-100 text-red-700 ring-1 ring-red-200",
  medium: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  low: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

const KIND_DOT: Record<AdminCallTaskKind, string> = {
  call_request: "bg-red-500",
  new_caretaker_followup: "bg-amber-500",
  half_year_check: "bg-sky-500",
  no_invoice_2_months: "bg-orange-500",
  missing_emergency_contact: "bg-slate-500",
  missing_contract: "bg-violet-500",
};

type FilterKind = "all" | AdminCallTaskKind;

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function AdminTasksPage() {
  const { user, isLoading: authLoading, authorized } = useRequireOffice();
  const {
    data: tasks = [],
    error: fetchError,
    isLoading: dataLoading,
    mutate: mutateTasks,
  } = useCachedFetch<AdminCallTask[]>(
    authorized ? "tasks" : null,
    getAdminCallTasks
  );
  const [filter, setFilter] = useState<FilterKind>("all");
  const [pageError, setPageError] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [flash, setFlash] = useState("");

  const filteredTasks = useMemo(() => {
    if (filter === "all") return tasks;
    return tasks.filter((t) => t.kind === filter);
  }, [tasks, filter]);

  const counts = useMemo(() => {
    const base: Record<FilterKind, number> = {
      all: tasks.length,
      call_request: 0,
      new_caretaker_followup: 0,
      half_year_check: 0,
      no_invoice_2_months: 0,
      missing_emergency_contact: 0,
      missing_contract: 0,
    };
    for (const t of tasks) base[t.kind] += 1;
    return base;
  }, [tasks]);

  const highCount = useMemo(
    () => tasks.filter((t) => t.priority === "high").length,
    [tasks]
  );

  async function handleDone(task: AdminCallTask) {
    const key = `${task.kind}:${task.source_id ?? task.patient_id}`;
    setBusyKey(key);
    setPageError("");
    setFlash("");
    try {
      if (task.kind === "call_request" && task.source_id != null) {
        await markCallRequestDone(task.source_id);
        setFlash(`Rückruf #${task.source_id} als erledigt markiert.`);
      } else {
        await markOfficeCallDone(task.patient_id);
        setFlash(
          `Büro-Kontakt für Patient ${
            task.patient_name ?? `#${task.patient_id}`
          } erfasst.`
        );
      }
      await mutateTasks();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Aktion konnte nicht abgeschlossen werden"
      );
    } finally {
      setBusyKey(null);
    }
  }

  if (authLoading || dataLoading) {
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
              Büro
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              Aufgaben-Feed
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {tasks.length} offene Aufgaben
              {highCount > 0 ? (
                <>
                  {" "}
                  · <span className="font-semibold text-red-600">
                    {highCount} dringend
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <button
            onClick={() => mutateTasks()}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <RefreshIcon className="h-4 w-4" />
            Aktualisieren
          </button>
        </div>
      </div>

      {(pageError || fetchError) && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircleIcon className="h-5 w-5 shrink-0" />
          {pageError || (fetchError instanceof Error ? fetchError.message : "Fehler beim Laden der Aufgaben")}
        </div>
      )}
      {flash && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircleIcon className="h-5 w-5 shrink-0" />
          {flash}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <FilterPill
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="Alle"
          count={counts.all}
        />
        {(Object.keys(KIND_LABELS) as AdminCallTaskKind[]).map((k) => (
          <FilterPill
            key={k}
            active={filter === k}
            onClick={() => setFilter(k)}
            label={KIND_LABELS[k]}
            count={counts[k]}
            dotColor={KIND_DOT[k]}
          />
        ))}
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {filteredTasks.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-16 text-center text-sm text-slate-400">
            <InboxIcon className="mb-2 h-10 w-10" />
            {tasks.length === 0
              ? "Keine offenen Aufgaben. Alles erledigt."
              : "Keine Aufgaben mit diesem Filter."}
          </div>
        ) : (
          <ul className="space-y-3">
            {filteredTasks.map((t) => {
              const key = `${t.kind}:${t.source_id ?? t.patient_id}`;
              const busy = busyKey === key;
              return (
                <li
                  key={key}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 sm:flex-row sm:items-center"
                >
                  <div
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white ${KIND_DOT[t.kind]}`}
                  >
                    {t.kind === "call_request" ? (
                      <PhoneIcon className="h-4 w-4" />
                    ) : (
                      <InboxIcon className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900">
                        {t.patient_name ?? `Patient #${t.patient_id}`}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PRIORITY_STYLE[t.priority]}`}
                      >
                        {t.priority}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-600">
                        {KIND_LABELS[t.kind]}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-700">
                      {t.title}
                    </p>
                    {t.subtitle ? (
                      <p className="truncate text-xs text-slate-500">
                        {t.subtitle}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-slate-400">
                      {formatDate(t.created_at)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDone(t)}
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-brand-900/20 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 sm:ml-auto"
                  >
                    <CheckCircleIcon className="h-4 w-4" />
                    {busy ? "Speichere …" : "Erledigt"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  count,
  dotColor,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  dotColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-slate-900 text-white shadow-sm"
          : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
    >
      {dotColor && <span className={`h-2 w-2 rounded-full ${dotColor}`} />}
      {label}
      <span
        className={`rounded-full px-1.5 text-xs font-semibold tabular-nums ${
          active ? "bg-white/20" : "bg-slate-100 text-slate-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
