"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PayrollEntryRecord,
  User,
  createPayrollEntry,
  getPayrollAttachmentUrl,
  getPayrollEntries,
  getUsers,
  updatePayrollEntry,
  uploadPayrollAttachment,
} from "@/lib/api";
import { useRequireAdmin } from "@/lib/use-require-role";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  RefreshIcon,
} from "@/components/icons";

const CATEGORY_LABELS: Record<string, string> = {
  krankmeldung: "Krankmeldung",
  kindkrankmeldung: "Kindkrankmeldung",
  gehaltsvorschuss: "Gehaltsvorschuss",
  ueberstundenauszahlung: "Ueberstundenauszahlung",
  lohnrueckfrage: "Lohnrueckfrage",
  sonstiges: "Sonstiges",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  done: "Erledigt",
};

function formatDate(value: string | null): string {
  if (!value) return "--";
  try {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "short" }).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return "--";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function LohnabrechnungPage() {
  const { user: me, isLoading: authLoading, authorized } = useRequireAdmin();
  const [entries, setEntries] = useState<PayrollEntryRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  // Editing
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);

  // New entry form
  const [showNew, setShowNew] = useState(false);
  const [newUserId, setNewUserId] = useState<string>("");
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newCategory, setNewCategory] = useState("sonstiges");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newFromDate, setNewFromDate] = useState("");
  const [newToDate, setNewToDate] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);

  const isAdmin = me?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const filters: { status?: string; category?: string } = {};
      if (statusFilter) filters.status = statusFilter;
      if (categoryFilter) filters.category = categoryFilter;
      const [data, userData] = await Promise.all([
        getPayrollEntries(filters),
        getUsers(),
      ]);
      setEntries(data);
      setUsers(userData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fehler beim Laden"
      );
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter]);

  useEffect(() => {
    if (authorized) load();
  }, [authorized, load]);

  const handleEdit = (entry: PayrollEntryRecord) => {
    setEditingId(entry.id);
    setEditStatus(entry.status);
    setEditNote(entry.handler_note || "");
  };

  const handleSave = async () => {
    if (editingId === null) return;
    setSaving(true);
    try {
      const payload: { status?: string; handler_note?: string } = {};
      payload.status = editStatus;
      if (isAdmin) payload.handler_note = editNote;
      await updatePayrollEntry(editingId, payload);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const result = await createPayrollEntry({
        user_id: newUserId ? Number(newUserId) : null,
        employee_name: newEmployeeName || null,
        category: newCategory,
        title: newTitle,
        description: newDescription || null,
        from_date: newFromDate || null,
        to_date: newToDate || null,
      });

      // Upload attachment if provided
      if (newFile) {
        await uploadPayrollAttachment(result.id, newFile);
      }

      setShowNew(false);
      setNewUserId("");
      setNewEmployeeName("");
      setNewCategory("sonstiges");
      setNewTitle("");
      setNewDescription("");
      setNewFromDate("");
      setNewToDate("");
      setNewFile(null);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erstellen fehlgeschlagen"
      );
    } finally {
      setCreating(false);
    }
  };

  if (!authorized) {
    return (
      <div className="space-y-6">
        <div className="h-20 animate-pulse rounded-3xl bg-white/60" />
        <div className="h-96 animate-pulse rounded-3xl bg-white/60" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Lohnabrechnung
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Krankmeldungen, Vorschuesse, Ueberstunden und weitere lohnrelevante
            Vorgaenge
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNew(true)}
            className="rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
          >
            Neuer Eintrag
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshIcon
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
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

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        >
          <option value="">Alle Status</option>
          <option value="open">Offen</option>
          <option value="in_progress">In Bearbeitung</option>
          <option value="done">Erledigt</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        >
          <option value="">Alle Kategorien</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* New Entry Form */}
      {showNew && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Neuer Eintrag
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Mitarbeiter (User)
              </label>
              <select
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">-- Kein User --</option>
                {users
                  .filter((u) => u.is_active)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.email})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Name (falls kein User)
              </label>
              <input
                type="text"
                value={newEmployeeName}
                onChange={(e) => setNewEmployeeName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Vor- und Nachname"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Kategorie
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Titel
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Titel / Betreff"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Von
              </label>
              <input
                type="date"
                value={newFromDate}
                onChange={(e) => setNewFromDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Bis
              </label>
              <input
                type="date"
                value={newToDate}
                onChange={(e) => setNewToDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Beschreibung
              </label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Optionale Beschreibung"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Attachment (PDF)
              </label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setNewFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-slate-600"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleCreate}
              disabled={creating || !newTitle.trim()}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {creating ? "Speichert..." : "Erstellen"}
            </button>
            <button
              onClick={() => setShowNew(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="px-4 py-3 font-medium text-slate-500">
                  Mitarbeiter
                </th>
                <th className="px-4 py-3 font-medium text-slate-500">
                  Kategorie
                </th>
                <th className="px-4 py-3 font-medium text-slate-500">Titel</th>
                <th className="px-4 py-3 font-medium text-slate-500">
                  Von - Bis
                </th>
                <th className="px-4 py-3 font-medium text-slate-500">
                  Status
                </th>
                <th className="px-4 py-3 font-medium text-slate-500">
                  Bearbeiter
                </th>
                <th className="px-4 py-3 font-medium text-slate-500">Datum</th>
                <th className="px-4 py-3 font-medium text-slate-500">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-slate-400"
                  >
                    Keine Eintraege gefunden.
                  </td>
                </tr>
              )}
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-slate-50 transition hover:bg-slate-50/50"
                >
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {entry.user_name || entry.employee_name || "--"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {CATEGORY_LABELS[entry.category] || entry.category}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-slate-700">
                    {entry.title}
                    {entry.attachment_path && (
                      <a
                        href={getPayrollAttachmentUrl(entry.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-xs text-brand-600 hover:underline"
                      >
                        [Anhang]
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {entry.from_date || entry.to_date
                      ? `${formatDate(entry.from_date)} - ${formatDate(entry.to_date)}`
                      : "--"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={entry.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {entry.handler_name || "--"}
                    {entry.handled_at && (
                      <span className="block text-xs text-slate-400">
                        {formatDateTime(entry.handled_at)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {formatDateTime(entry.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === entry.id ? (
                      <div className="space-y-2">
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                        >
                          <option value="open">Offen</option>
                          <option value="in_progress">In Bearbeitung</option>
                          <option value="done">Erledigt</option>
                        </select>
                        {isAdmin && (
                          <textarea
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            rows={2}
                            placeholder="Antwort / Notiz"
                            className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                          />
                        )}
                        <div className="flex gap-1">
                          <button
                            onClick={handleSave}
                            disabled={saving}
                            className="rounded-lg bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                          >
                            {saving ? "..." : "Speichern"}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                          >
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEdit(entry)}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
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
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    open: "bg-amber-50 text-amber-700 ring-amber-200",
    in_progress: "bg-blue-50 text-blue-700 ring-blue-200",
    done: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
        styles[status] || "bg-slate-50 text-slate-600 ring-slate-200"
      }`}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}
