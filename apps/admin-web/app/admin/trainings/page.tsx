"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminTraining,
  User,
  createAdminTraining,
  deleteAdminTraining,
  getAdminTrainings,
  getMe,
} from "@/lib/api";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  RefreshIcon,
  SparkleIcon,
} from "@/components/icons";

function formatDate(value: string | null): string {
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

export default function AdminTrainingsPage() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<AdminTraining[]>([]);
  const [pageError, setPageError] = useState("");
  const [flash, setFlash] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    setPageError("");
    try {
      const data = await getAdminTrainings();
      setItems(data);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Fehler beim Laden"
      );
    } finally {
      setRefreshing(false);
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
      return;
    } finally {
      setBooting(false);
    }
  }, [loadData, router]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startsAt) {
      setPageError("Titel und Start-Datum sind Pflicht.");
      return;
    }
    setSaving(true);
    setPageError("");
    setFlash("");
    try {
      await createAdminTraining({
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      });
      setFlash(`Fortbildung "${title.trim()}" angelegt.`);
      setTitle("");
      setDescription("");
      setLocation("");
      setStartsAt("");
      setEndsAt("");
      setShowForm(false);
      await loadData();
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: AdminTraining) {
    if (!window.confirm(`Fortbildung "${t.title}" wirklich löschen?`)) return;
    setPageError("");
    try {
      await deleteAdminTraining(t.id);
      setFlash(`Fortbildung "${t.title}" gelöscht.`);
      await loadData();
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Fehler");
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
              Team
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              Fortbildungen
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {items.length} Termine · werden auf dem Mobile-Homescreen und
              als Push-Notification an alle Betreuer geschickt
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowForm((v) => !v)}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
            >
              <SparkleIcon className="h-4 w-4" />
              {showForm ? "Formular schließen" : "Neue Fortbildung"}
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

      {showForm && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <form onSubmit={handleCreate} className="grid gap-4 lg:grid-cols-2">
            <Field label="Titel *" full>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="form-input"
                required
              />
            </Field>
            <Field label="Start-Termin *">
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="form-input"
                required
              />
            </Field>
            <Field label="Ende (optional)">
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="form-input"
              />
            </Field>
            <Field label="Ort (optional)" full>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="form-input"
                placeholder="z.B. Online / Büro"
              />
            </Field>
            <Field label="Beschreibung (optional)" full>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="form-input"
              />
            </Field>
            <button
              type="submit"
              disabled={saving}
              className="lg:col-span-2 rounded-2xl bg-brand-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? "Speichere …" : "Fortbildung anlegen"}
            </button>
          </form>
          <style>{`
            .form-input {
              width: 100%;
              border-radius: 0.75rem;
              border: 1px solid #e2e8f0;
              background: rgba(248, 250, 252, 0.5);
              padding: 0.625rem 1rem;
              font-size: 0.875rem;
              outline: none;
            }
            .form-input:focus { border-color: #a78bfa; background: white; }
          `}</style>
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {items.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-16 text-center text-sm text-slate-400">
            Noch keine Fortbildungen angelegt.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-slate-900">
                    {t.title}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDate(t.starts_at)}
                    {t.ends_at ? ` – ${formatDate(t.ends_at)}` : ""}
                    {t.location ? ` · ${t.location}` : ""}
                  </p>
                  {t.description && (
                    <p className="mt-1 text-sm text-slate-600">
                      {t.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(t)}
                  className="inline-flex items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-100 sm:ml-auto"
                >
                  Löschen
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "lg:col-span-2" : ""}`}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
