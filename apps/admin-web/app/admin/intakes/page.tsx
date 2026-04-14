"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminPatientIntake,
  User,
  getAdminPatientIntakes,
  getMe,
  resolveAdminPatientIntake,
} from "@/lib/api";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  RefreshIcon,
  UsersIcon,
} from "@/components/icons";

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

export default function AdminIntakesPage() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<AdminPatientIntake[]>([]);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [pageError, setPageError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [flash, setFlash] = useState("");

  const loadData = useCallback(async () => {
    setRefreshing(true);
    setPageError("");
    try {
      const data = await getAdminPatientIntakes(
        filter === "open" ? "open" : undefined
      );
      setItems(data);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Fehler beim Laden"
      );
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

  async function handleResolve(
    intake: AdminPatientIntake,
    status: "done" | "rejected"
  ) {
    let pattiId: number | null = null;
    if (status === "done") {
      const input = window.prompt(
        `Patti-Patient-ID für ${intake.full_name} eingeben (oder leer lassen):`
      );
      if (input === null) return; // cancelled
      if (input.trim()) {
        const parsed = Number(input.trim());
        if (!Number.isFinite(parsed)) {
          window.alert("Ungültige Patti-ID — abgebrochen.");
          return;
        }
        pattiId = parsed;
      }
    } else {
      if (
        !window.confirm(`Neuaufnahme für ${intake.full_name} wirklich ablehnen?`)
      ) {
        return;
      }
    }

    setBusyId(intake.id);
    setPageError("");
    setFlash("");
    try {
      await resolveAdminPatientIntake(intake.id, {
        status,
        patti_patient_id: pattiId,
      });
      setFlash(
        status === "done"
          ? `Neuaufnahme ${intake.full_name} als erledigt markiert.`
          : `Neuaufnahme ${intake.full_name} abgelehnt.`
      );
      await loadData();
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Aktion fehlgeschlagen"
      );
    } finally {
      setBusyId(null);
    }
  }

  if (booting) {
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
              Patient-Neuaufnahmen
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {items.length} Einträge · vom Mobile erfasste Stammdaten
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

      {pageError && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircleIcon className="h-5 w-5 shrink-0" />
          {pageError}
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
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-16 text-center text-sm text-slate-400">
            <UsersIcon className="mb-2 h-10 w-10" />
            Keine Neuaufnahmen mit diesem Filter.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((i) => {
              const busy = busyId === i.id;
              return (
                <li
                  key={i.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-slate-900">
                      {i.full_name}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        i.status === "open"
                          ? "bg-amber-100 text-amber-800"
                          : i.status === "done"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {i.status}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {formatDate(i.created_at)}
                    </span>
                  </div>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <Detail label="Geburtsdatum" value={i.birthdate} />
                    <Detail label="Telefon" value={i.phone} />
                    <Detail label="Adresse" value={i.address} full />
                    <Detail label="Kontaktperson" value={i.contact_person} />
                    <Detail label="Pflegegrad" value={i.care_level} />
                    {i.note && <Detail label="Notiz" value={i.note} full />}
                    {i.patti_patient_id != null && (
                      <Detail
                        label="Patti-Patient-ID"
                        value={`#${i.patti_patient_id}`}
                      />
                    )}
                  </dl>
                  {i.status === "open" && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        onClick={() => handleResolve(i, "done")}
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
                      >
                        <CheckCircleIcon className="h-4 w-4" />
                        {busy ? "Speichere …" : "Erledigt (in Patti angelegt)"}
                      </button>
                      <button
                        onClick={() => handleResolve(i, "rejected")}
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                      >
                        Ablehnen
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Detail({
  label,
  value,
  full,
}: {
  label: string;
  value: string | null | undefined;
  full?: boolean;
}) {
  return (
    <div
      className={`rounded-xl bg-slate-50/70 px-3 py-2 ${full ? "sm:col-span-2" : ""}`}
    >
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-700">
        {value ?? "—"}
      </dd>
    </div>
  );
}
