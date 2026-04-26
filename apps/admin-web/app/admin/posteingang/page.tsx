"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MailEntryRecord,
  User,
  classifyMailEntry,
  createMailEntry,
  getMailEntries,
  getMailScanUrl,
  getMe,
  getUsers,
  updateMailEntry,
  uploadMailScan,
} from "@/lib/api";
import { RefreshIcon } from "@/components/icons";

// ── Label maps ──────────────────────────────────────────────────────────

const DEPARTMENT_LABELS: Record<string, string> = {
  assistenz_gf: "Assistenz GF",
  geschaeftsfuehrung: "Geschäftsführung",
  lohnabrechnung: "Lohnabrechnung",
  tagesgeschaeft: "Tagesgeschäft",
  finanzassistenz: "Finanzassistenz",
  mahnwesen: "Mahnwesen",
  unklar: "Unklar",
};

const DEPARTMENT_COLORS: Record<string, string> = {
  assistenz_gf: "bg-purple-100 text-purple-700",
  geschaeftsfuehrung: "bg-red-100 text-red-700",
  lohnabrechnung: "bg-blue-100 text-blue-700",
  tagesgeschaeft: "bg-amber-100 text-amber-700",
  finanzassistenz: "bg-emerald-100 text-emerald-700",
  mahnwesen: "bg-orange-100 text-orange-700",
  unklar: "bg-slate-100 text-slate-600",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  critical: "Kritisch",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  eingegangen: "Eingegangen",
  zugewiesen: "Zugewiesen",
  in_bearbeitung: "In Bearbeitung",
  erledigt: "Erledigt",
};

// Map mail department -> user department for assignment filtering
const DEPT_TO_USER_DEPT: Record<string, string[]> = {
  assistenz_gf: ["assistenz_gf"],
  geschaeftsfuehrung: ["geschaeftsfuehrung", "assistenz_gf"],
  lohnabrechnung: ["abrechnung"],
  tagesgeschaeft: ["tagesgeschaeft"],
  finanzassistenz: ["abrechnung"],
  mahnwesen: ["mahnwesen"],
  unklar: [],
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

export default function PosteingangPage() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);
  const [me, setMe] = useState<User | null>(null);
  const [entries, setEntries] = useState<MailEntryRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filters
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  // Editing
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editAssignedTo, setEditAssignedTo] = useState<number | null>(null);
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);

  // New entry form
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSender, setNewSender] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newDepartment, setNewDepartment] = useState("unklar");
  const [newPriority, setNewPriority] = useState("medium");
  const [creating, setCreating] = useState(false);

  // File upload refs
  const scanFileRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const newScanFileRef = useRef<HTMLInputElement>(null);

  // AI classify
  const [classifyingId, setClassifyingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [meData, data, usersData] = await Promise.all([
        getMe(),
        getMailEntries({
          department: departmentFilter || undefined,
          status: statusFilter || undefined,
          priority: priorityFilter || undefined,
        }),
        getUsers(),
      ]);
      setMe(meData);
      setEntries(data);
      setUsers(usersData.filter((u) => u.is_active));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
      setBooting(false);
    }
  }, [departmentFilter, statusFilter, priorityFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Create ──────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!newTitle.trim() || !newDate) return;
    setCreating(true);
    try {
      const created = await createMailEntry({
        title: newTitle,
        sender: newSender || null,
        received_date: newDate,
        department: newDepartment,
        priority: newPriority,
      });

      // Upload scan if selected
      const file = newScanFileRef.current?.files?.[0];
      if (file) {
        await uploadMailScan(created.id, file);
      }

      setNewTitle("");
      setNewSender("");
      setNewDate(new Date().toISOString().slice(0, 10));
      setNewDepartment("unklar");
      setNewPriority("medium");
      if (newScanFileRef.current) newScanFileRef.current.value = "";
      setShowNew(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Erstellen");
    } finally {
      setCreating(false);
    }
  }

  // ── Edit ────────────────────────────────────────────────────────────

  function startEdit(entry: MailEntryRecord) {
    setEditingId(entry.id);
    setEditStatus(entry.status);
    setEditDepartment(entry.department);
    setEditPriority(entry.priority);
    setEditAssignedTo(entry.assigned_to_user_id);
    setEditNote(entry.handler_note ?? "");
  }

  async function handleSave(id: number) {
    setSaving(true);
    try {
      await updateMailEntry(id, {
        status: editStatus,
        department: editDepartment,
        priority: editPriority,
        assigned_to_user_id: editAssignedTo,
        handler_note: editNote || undefined,
      });
      setEditingId(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  // ── Upload scan ─────────────────────────────────────────────────────

  async function handleUploadScan(id: number, file: File) {
    setUploadingId(id);
    try {
      await uploadMailScan(id, file);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload fehlgeschlagen");
    } finally {
      setUploadingId(null);
    }
  }

  // ── Classify ────────────────────────────────────────────────────────

  async function handleClassify(id: number) {
    setClassifyingId(id);
    try {
      await classifyMailEntry(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Klassifizierung fehlgeschlagen");
    } finally {
      setClassifyingId(null);
    }
  }

  // ── Users filtered by department ────────────────────────────────────

  function getUsersForDepartment(dept: string): User[] {
    const mappedDepts = DEPT_TO_USER_DEPT[dept] ?? [];
    if (mappedDepts.length === 0) return users;
    return users.filter(
      (u) => u.department && mappedDepts.includes(u.department)
    );
  }

  // ── Render ──────────────────────────────────────────────────────────

  if (booting) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-700" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Posteingang</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowNew((p) => !p)}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {showNew ? "Abbrechen" : "Neuer Brief"}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="ml-2 underline">
            Schliessen
          </button>
        </div>
      )}

      {/* ── New entry form ─────────────────────────────────────────────── */}
      {showNew && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Neuen Brief erfassen</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Titel / Betreff *
              </span>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
                required
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Absender
              </span>
              <input
                type="text"
                value={newSender}
                onChange={(e) => setNewSender(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Eingangsdatum *
              </span>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
                required
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Abteilung
              </span>
              <select
                value={newDepartment}
                onChange={(e) => setNewDepartment(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
              >
                {Object.entries(DEPARTMENT_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Priorität
              </span>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
              >
                {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Scan (PDF/JPG)
              </span>
              <input
                type="file"
                ref={newScanFileRef}
                accept=".pdf,.jpg,.jpeg,.png"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm"
              />
            </label>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !newTitle.trim()}
            className="mt-4 rounded-xl bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {creating ? "Erstellt..." : "Brief erfassen"}
          </button>
        </div>
      )}

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        >
          <option value="">Alle Abteilungen</option>
          {Object.entries(DEPARTMENT_LABELS).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        >
          <option value="">Alle Status</option>
          {Object.entries(STATUS_LABELS).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        >
          <option value="">Alle Prioritäten</option>
          {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Datum</th>
              <th className="px-4 py-3">Absender</th>
              <th className="px-4 py-3">Titel</th>
              <th className="px-4 py-3">Abteilung</th>
              <th className="px-4 py-3">Priorität</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Zugewiesen</th>
              <th className="px-4 py-3">Bearbeiter</th>
              <th className="px-4 py-3">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  {loading ? "Laden..." : "Keine Einträge"}
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3">
                  {formatDate(entry.received_date)}
                </td>
                <td className="px-4 py-3">{entry.sender || "--"}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{entry.title}</div>
                  {entry.description && (
                    <div className="mt-0.5 text-xs text-slate-500">
                      {entry.description}
                    </div>
                  )}
                  {entry.ai_classification && (
                    <div className="mt-1 text-xs text-indigo-600">
                      AI: {(() => {
                        try {
                          const c = JSON.parse(entry.ai_classification);
                          return c.summary || JSON.stringify(c);
                        } catch {
                          return entry.ai_classification;
                        }
                      })()}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      DEPARTMENT_COLORS[entry.department] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {DEPARTMENT_LABELS[entry.department] ?? entry.department}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      PRIORITY_COLORS[entry.priority] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {PRIORITY_LABELS[entry.priority] ?? entry.priority}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {STATUS_LABELS[entry.status] ?? entry.status}
                </td>
                <td className="px-4 py-3 text-xs">
                  {entry.assigned_to_name || "--"}
                </td>
                <td className="px-4 py-3 text-xs">
                  {entry.handler_name ? (
                    <div>
                      {entry.handler_name}
                      <br />
                      <span className="text-slate-400">
                        {formatDateTime(entry.handled_at)}
                      </span>
                    </div>
                  ) : (
                    "--"
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {/* Edit button */}
                    <button
                      onClick={() =>
                        editingId === entry.id
                          ? setEditingId(null)
                          : startEdit(entry)
                      }
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                    >
                      {editingId === entry.id ? "X" : "Bearbeiten"}
                    </button>

                    {/* AI Classify */}
                    <button
                      onClick={() => handleClassify(entry.id)}
                      disabled={classifyingId === entry.id}
                      className="rounded-lg border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {classifyingId === entry.id ? "..." : "AI"}
                    </button>

                    {/* Scan download */}
                    {entry.scan_path && (
                      <a
                        href={getMailScanUrl(entry.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
                      >
                        Scan
                      </a>
                    )}

                    {/* Scan upload */}
                    {!entry.scan_path && (
                      <>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="hidden"
                          ref={scanFileRef}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUploadScan(entry.id, f);
                          }}
                        />
                        <button
                          onClick={() => scanFileRef.current?.click()}
                          disabled={uploadingId === entry.id}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50"
                        >
                          {uploadingId === entry.id ? "..." : "Upload"}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Inline edit form ───────────────────────────────────────────── */}
      {editingId !== null && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-semibold text-slate-900">
            Brief #{editingId} bearbeiten
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Status
              </span>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              >
                {Object.entries(STATUS_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Abteilung
              </span>
              <select
                value={editDepartment}
                onChange={(e) => setEditDepartment(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              >
                {Object.entries(DEPARTMENT_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Priorität
              </span>
              <select
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              >
                {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Zugewiesen an
              </span>
              <select
                value={editAssignedTo ?? ""}
                onChange={(e) =>
                  setEditAssignedTo(
                    e.target.value === "" ? null : Number(e.target.value)
                  )
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              >
                <option value="">-- nicht zugewiesen --</option>
                {getUsersForDepartment(editDepartment).length > 0 ? (
                  <>
                    <optgroup label="Passende Abteilung">
                      {getUsersForDepartment(editDepartment).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Alle">
                      {users
                        .filter(
                          (u) =>
                            !getUsersForDepartment(editDepartment).find(
                              (fu) => fu.id === u.id
                            )
                        )
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name}
                          </option>
                        ))}
                    </optgroup>
                  </>
                ) : (
                  users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Notiz
              </span>
              <textarea
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500"
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => handleSave(editingId)}
              disabled={saving}
              className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Speichert..." : "Speichern"}
            </button>
            <button
              onClick={() => setEditingId(null)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
