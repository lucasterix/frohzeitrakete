"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, getMe } from "@/lib/api";
import {
  fetchWithRefresh,
  buildHeaders,
  API_BASE_URL,
} from "@/lib/api-helpers";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  RefreshIcon,
} from "@/components/icons";

type ItTicket = {
  id: number;
  user_id: number;
  user_name: string;
  title: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  device_info: string | null;
  response_text: string | null;
  handler_user_id: number | null;
  handler_name: string | null;
  handled_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

async function fetchTickets(statusFilter?: string): Promise<ItTicket[]> {
  const url = new URL(`${API_BASE_URL}/admin/it-tickets`);
  if (statusFilter) url.searchParams.set("status", statusFilter);
  const res = await fetchWithRefresh(url.toString(), {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Fehler beim Laden der Tickets");
  return res.json();
}

async function updateTicket(
  id: number,
  payload: Record<string, unknown>
): Promise<void> {
  const res = await fetchWithRefresh(`${API_BASE_URL}/admin/it-tickets/${id}`, {
    method: "PATCH",
    headers: { ...buildHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Fehler beim Aktualisieren");
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "--";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const STATUS_LABELS: Record<string, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  done: "Erledigt",
  rejected: "Abgelehnt",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  done: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-red-100 text-red-800",
};

const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug",
  feature: "Feature",
  frage: "Frage",
  sonstiges: "Sonstiges",
  crash: "Crash",
};

export default function ItTicketsPage() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<ItTicket[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editResponse, setEditResponse] = useState("");

  const loadData = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      setItems(await fetchTickets(statusFilter || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setRefreshing(false);
    }
  }, [statusFilter]);

  const bootstrap = useCallback(async () => {
    try {
      const me: User = await getMe();
      if (
        me.role !== "admin" &&
        me.role !== "buero" &&
        me.role !== "standortleiter"
      ) {
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
  }, [statusFilter, booting, loadData]);

  function openEdit(ticket: ItTicket) {
    if (expandedId === ticket.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(ticket.id);
    setEditStatus(ticket.status);
    setEditPriority(ticket.priority);
    setEditResponse(ticket.response_text || "");
  }

  async function handleSave(id: number) {
    setError("");
    setFlash("");
    try {
      await updateTicket(id, {
        status: editStatus,
        priority: editPriority,
        response_text: editResponse || null,
      });
      setFlash(`Ticket #${id} aktualisiert.`);
      setExpandedId(null);
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
      {/* Header */}
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Support
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              IT-Tickets
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {items.length} Tickets
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {["", "open", "in_progress", "done", "rejected"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                  statusFilter === s
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-700"
                }`}
              >
                {s === "" ? "Alle" : STATUS_LABELS[s] || s}
              </button>
            ))}
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

      {/* Ticket List */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {items.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
            Keine Tickets mit diesem Filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Titel</th>
                  <th className="px-3 py-2">Kategorie</th>
                  <th className="px-3 py-2">Prioritaet</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-3 py-2">Geraet</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <>
                    <tr
                      key={t.id}
                      onClick={() => openEdit(t)}
                      className={`cursor-pointer border-b border-slate-50 transition hover:bg-slate-50 ${
                        expandedId === t.id ? "bg-slate-50" : ""
                      }`}
                    >
                      <td className="px-3 py-3 font-mono text-xs text-slate-500">
                        {t.id}
                      </td>
                      <td className="px-3 py-3 font-medium">{t.user_name}</td>
                      <td className="max-w-[200px] truncate px-3 py-3">
                        {t.title}
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase">
                          {CATEGORY_LABELS[t.category] || t.category}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            PRIORITY_COLORS[t.priority] || ""
                          }`}
                        >
                          {t.priority}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            STATUS_COLORS[t.status] || ""
                          }`}
                        >
                          {STATUS_LABELS[t.status] || t.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">
                        {formatDateTime(t.created_at)}
                      </td>
                      <td className="max-w-[120px] truncate px-3 py-3 text-xs text-slate-400">
                        {t.device_info || "--"}
                      </td>
                    </tr>
                    {expandedId === t.id && (
                      <tr key={`edit-${t.id}`}>
                        <td colSpan={8} className="bg-slate-50/50 px-4 py-4">
                          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                            {/* Description */}
                            <div>
                              <p className="text-xs font-semibold text-slate-500">
                                Beschreibung
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                                {t.description}
                              </p>
                            </div>

                            {t.device_info && (
                              <div>
                                <p className="text-xs font-semibold text-slate-500">
                                  Geraeteinfo
                                </p>
                                <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">
                                  {t.device_info}
                                </p>
                              </div>
                            )}

                            {/* Edit form */}
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                              <div>
                                <label className="text-xs font-semibold text-slate-500">
                                  Status
                                </label>
                                <select
                                  value={editStatus}
                                  onChange={(e) =>
                                    setEditStatus(e.target.value)
                                  }
                                  className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                >
                                  <option value="open">Offen</option>
                                  <option value="in_progress">
                                    In Bearbeitung
                                  </option>
                                  <option value="done">Erledigt</option>
                                  <option value="rejected">Abgelehnt</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-500">
                                  Prioritaet
                                </label>
                                <select
                                  value={editPriority}
                                  onChange={(e) =>
                                    setEditPriority(e.target.value)
                                  }
                                  className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                >
                                  <option value="low">Low</option>
                                  <option value="medium">Medium</option>
                                  <option value="high">High</option>
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="text-xs font-semibold text-slate-500">
                                Antwort
                              </label>
                              <textarea
                                value={editResponse}
                                onChange={(e) =>
                                  setEditResponse(e.target.value)
                                }
                                rows={3}
                                className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                placeholder="Antwort an den User..."
                              />
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSave(t.id)}
                                className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                              >
                                Speichern
                              </button>
                              <button
                                onClick={() => setExpandedId(null)}
                                className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                              >
                                Abbrechen
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
