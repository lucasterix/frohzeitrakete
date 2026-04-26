"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";
import { useRequireOffice } from "@/lib/use-require-role";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  RefreshIcon,
} from "@/components/icons";

type BudgetInquiry = {
  id: number;
  patient_id: number;
  patient_name: string;
  versichertennummer: string | null;
  geburtsdatum: string | null;
  kasse_name: string | null;
  kasse_ik: string | null;
  user_id: number;
  signature_event_id: number | null;
  task_status: string;
  handler_user_id: number | null;
  handled_at: string | null;
  handler_note: string | null;
  handler_name: string | null;
  created_at: string | null;
};

type UserOption = {
  id: number;
  full_name: string;
  patti_person_id: number | null;
};

export default function BudgetInquiriesPage() {
  const { authorized, isLoading } = useRequireOffice();
  const [booting, setBooting] = useState(true);
  const [inquiries, setInquiries] = useState<BudgetInquiry[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [loading, setLoading] = useState(false);

  // Filter
  const [filterUserId, setFilterUserId] = useState<string>("");
  const [filterTaskStatus, setFilterTaskStatus] = useState<string>("");

  // Generate form
  const [genPatientId, setGenPatientId] = useState("");
  const [genUserId, setGenUserId] = useState("");
  const [batchUserId, setBatchUserId] = useState("");

  // Selection for batch-selected
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Inline edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editStatus, setEditStatus] = useState("pending");
  const [editError, setEditError] = useState("");

  const loadInquiries = useCallback(
    async (userId?: string, taskStatus?: string) => {
      try {
        const params = new URLSearchParams();
        if (userId) params.set("user_id", userId);
        if (taskStatus) params.set("task_status", taskStatus);
        const res = await fetchWithRefresh(
          `${API_BASE_URL}/admin/budget-inquiries?${params.toString()}`,
          { headers: buildHeaders() }
        );
        if (res.ok) {
          setInquiries(await res.json());
          setSelectedIds(new Set());
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler beim Laden");
      }
    },
    []
  );

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetchWithRefresh(`${API_BASE_URL}/admin/users`, {
        headers: buildHeaders(),
      });
      if (res.ok) {
        const data: UserOption[] = await res.json();
        setUsers(data.filter((u) => u.patti_person_id));
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    (async () => {
      try {
        await Promise.all([loadInquiries(), loadUsers()]);
      } finally {
        setBooting(false);
      }
    })();
  }, [authorized, loadInquiries, loadUsers]);

  async function handleGenerate() {
    if (!genPatientId || !genUserId) return;
    setLoading(true);
    setError("");
    setFlash("");
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/budget-inquiries/generate`,
        {
          method: "POST",
          headers: { ...buildHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            patient_id: parseInt(genPatientId),
            user_id: parseInt(genUserId),
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Generierung fehlgeschlagen");
      }
      setGenPatientId("");
      setFlash("Budgetanfrage generiert.");
      await loadInquiries(filterUserId, filterTaskStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }

  async function handleBatch() {
    if (!batchUserId) return;
    setLoading(true);
    setError("");
    setFlash("");
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/budget-inquiries/batch`,
        {
          method: "POST",
          headers: { ...buildHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: parseInt(batchUserId) }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Batch fehlgeschlagen");
      }
      const data = await res.json();
      setFlash(`${data.generated} Budgetanfrage(n) generiert.`);
      await loadInquiries(filterUserId, filterTaskStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }

  async function handleBatchAll() {
    if (!window.confirm("Budgetabfragen fuer ALLE Patienten mit Signatur generieren?"))
      return;
    setLoading(true);
    setError("");
    setFlash("");
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/budget-inquiries/batch-all`,
        {
          method: "POST",
          headers: { ...buildHeaders(), "Content-Type": "application/json" },
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Batch-All fehlgeschlagen");
      }
      const data = await res.json();
      setFlash(`${data.generated} Budgetanfrage(n) fuer alle Patienten generiert.`);
      await loadInquiries(filterUserId, filterTaskStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateSelected() {
    if (selectedIds.size === 0) return;
    const firstUser = users[0];
    if (!firstUser) return;
    setLoading(true);
    setError("");
    setFlash("");
    try {
      // Collect unique patient_ids from selected inquiries
      const patientIds = Array.from(selectedIds).map((id) => {
        const inq = inquiries.find((i) => i.id === id);
        return inq?.patient_id;
      }).filter((pid): pid is number => pid !== undefined);

      const uniquePatientIds = Array.from(new Set(patientIds));
      if (uniquePatientIds.length === 0) return;

      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/budget-inquiries/generate-selected`,
        {
          method: "POST",
          headers: { ...buildHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            patient_ids: uniquePatientIds,
            user_id: firstUser.id,
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Generierung fehlgeschlagen");
      }
      const data = await res.json();
      setFlash(`${data.generated} Budgetanfrage(n) fuer ausgewaehlte Patienten generiert.`);
      setSelectedIds(new Set());
      await loadInquiries(filterUserId, filterTaskStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkDone(inquiryId: number) {
    setError("");
    setFlash("");
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/budget-inquiries/${inquiryId}/done`,
        {
          method: "PATCH",
          headers: { ...buildHeaders(), "Content-Type": "application/json" },
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Fehler");
      }
      setFlash("Als erledigt markiert.");
      await loadInquiries(filterUserId, filterTaskStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  }

  function startEditing(inq: BudgetInquiry) {
    setEditingId(inq.id);
    setEditNote(inq.handler_note || "");
    setEditStatus(inq.task_status);
    setEditError("");
  }

  function cancelEditing() {
    setEditingId(null);
    setEditNote("");
    setEditStatus("pending");
    setEditError("");
  }

  async function handleSaveEdit(inquiryId: number) {
    setEditError("");
    if (editStatus === "done" && editNote.trim().length < 5) {
      setEditError("Beim Erledigt-Setzen ist eine Notiz mit mind. 5 Zeichen Pflicht.");
      return;
    }
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/budget-inquiries/${inquiryId}`,
        {
          method: "PATCH",
          headers: { ...buildHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            task_status: editStatus,
            handler_note: editNote,
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Fehler beim Speichern");
      }
      setFlash("Bearbeitungsvermerk gespeichert.");
      setEditingId(null);
      await loadInquiries(filterUserId, filterTaskStatus);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Fehler");
    }
  }

  function handleFilterChange(userId: string) {
    setFilterUserId(userId);
    loadInquiries(userId, filterTaskStatus);
  }

  function handleTaskStatusFilterChange(status: string) {
    setFilterTaskStatus(status);
    loadInquiries(filterUserId, status);
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === inquiries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(inquiries.map((i) => i.id)));
    }
  }

  function openPdf(id: number) {
    window.open(
      `${API_BASE_URL}/admin/budget-inquiries/${id}/pdf`,
      "_blank"
    );
  }

  if (isLoading || !authorized || booting)
    return <div className="h-64 animate-pulse rounded-3xl bg-white/60" />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Pflegekassen
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              Budgetabfragen
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Entlastungsbudget-Anfragen nach §45b SGB XI
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleBatchAll}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              Batch: Alle Patienten
            </button>
            {selectedIds.size > 0 && (
              <button
                onClick={handleGenerateSelected}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
              >
                Fuer Ausgewaehlte generieren ({selectedIds.size})
              </button>
            )}
            <button
              onClick={() => loadInquiries(filterUserId, filterTaskStatus)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <RefreshIcon className="h-4 w-4" />
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

      {/* Actions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Einzelne generieren */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            Einzelne Anfrage generieren
          </h3>
          <div className="flex flex-col gap-2">
            <input
              type="number"
              placeholder="Patient-ID"
              value={genPatientId}
              onChange={(e) => setGenPatientId(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <select
              value={genUserId}
              onChange={(e) => setGenUserId(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Betreuer waehlen...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
            <button
              onClick={handleGenerate}
              disabled={loading || !genPatientId || !genUserId}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? "Wird generiert..." : "Generieren"}
            </button>
          </div>
        </div>

        {/* Batch per Betreuer */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            Batch: Alle Patienten eines Betreuers
          </h3>
          <div className="flex flex-col gap-2">
            <select
              value={batchUserId}
              onChange={(e) => setBatchUserId(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Betreuer waehlen...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
            <button
              onClick={handleBatch}
              disabled={loading || !batchUserId}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? "Wird generiert..." : "Batch generieren"}
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600">Betreuer:</label>
          <select
            value={filterUserId}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Alle</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600">Status:</label>
          <select
            value={filterTaskStatus}
            onChange={(e) => handleTaskStatusFilterChange(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Alle</option>
            <option value="pending">Offene Aufgaben</option>
            <option value="done">Erledigt</option>
          </select>
        </div>
      </div>

      {/* Tabelle */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Budgetanfragen
        </h2>
        {inquiries.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
            Noch keine Budgetanfragen vorhanden.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={
                        inquiries.length > 0 &&
                        selectedIds.size === inquiries.length
                      }
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="px-3 py-2">Patient</th>
                  <th className="px-3 py-2">Vers.Nr.</th>
                  <th className="px-3 py-2">Kasse</th>
                  <th className="px-3 py-2">Betreuer</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Bearbeitet</th>
                  <th className="px-3 py-2">Erstellt</th>
                  <th className="px-3 py-2">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {inquiries.map((inq) => {
                  const betreuer = users.find((u) => u.id === inq.user_id);
                  const isEditing = editingId === inq.id;
                  return (
                    <tr
                      key={inq.id}
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(inq.id)}
                          onChange={() => toggleSelect(inq.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-900">
                        {inq.patient_name}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {inq.versichertennummer || "--"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {inq.kasse_name || "--"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {betreuer?.full_name || `User #${inq.user_id}`}
                      </td>
                      <td className="px-3 py-2.5">
                        {isEditing ? (
                          <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value)}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                          >
                            <option value="pending">Offen</option>
                            <option value="done">Erledigt</option>
                          </select>
                        ) : (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              inq.task_status === "done"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {inq.task_status === "done" ? "Erledigt" : "Offen"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 text-xs">
                        {isEditing ? (
                          <div className="flex flex-col gap-1">
                            <textarea
                              value={editNote}
                              onChange={(e) => setEditNote(e.target.value)}
                              placeholder="Notiz eingeben..."
                              rows={2}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs w-full min-w-[160px]"
                            />
                            {editError && (
                              <span className="text-[10px] text-red-600">{editError}</span>
                            )}
                          </div>
                        ) : inq.handled_at ? (
                          <div>
                            <span className="font-medium text-slate-700">
                              {inq.handler_name || `User #${inq.handler_user_id}`}
                            </span>
                            <br />
                            <span>
                              {new Date(inq.handled_at).toLocaleDateString("de-DE")}
                            </span>
                            {inq.handler_note && (
                              <>
                                <br />
                                <span className="italic text-slate-400">
                                  {inq.handler_note}
                                </span>
                              </>
                            )}
                          </div>
                        ) : (
                          "--"
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">
                        {inq.created_at
                          ? new Date(inq.created_at).toLocaleDateString("de-DE")
                          : "--"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openPdf(inq.id)}
                            className="rounded-lg bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                          >
                            PDF
                          </button>
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(inq.id)}
                                className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                              >
                                Speichern
                              </button>
                              <button
                                onClick={cancelEditing}
                                className="rounded-lg bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                              >
                                Abbrechen
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => startEditing(inq)}
                              className="rounded-lg bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                            >
                              Bearbeiten
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
