"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApplicantRecord,
  createApplicant,
  deleteApplicant,
  getApplicants,
  getApplicantResumeUrl,
  sendApplicantEmail,
  updateApplicant,
  uploadApplicantResume,
} from "@/lib/api";
import { useRequireOffice } from "@/lib/use-require-role";
import { useAuth } from "@/lib/auth-context";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  RefreshIcon,
  UsersIcon,
} from "@/components/icons";

const STATUS_LABELS: Record<string, string> = {
  eingegangen: "Eingegangen",
  in_pruefung: "In Prüfung",
  einladung: "Einladung",
  gespraech: "Gespräch",
  zusage: "Zusage",
  absage: "Absage",
  zurueckgezogen: "Zurückgezogen",
};

const STATUS_COLORS: Record<string, string> = {
  eingegangen: "bg-blue-100 text-blue-700",
  in_pruefung: "bg-amber-100 text-amber-700",
  einladung: "bg-purple-100 text-purple-700",
  gespraech: "bg-indigo-100 text-indigo-700",
  zusage: "bg-emerald-100 text-emerald-700",
  absage: "bg-red-100 text-red-700",
  zurueckgezogen: "bg-slate-100 text-slate-500",
};

const PIPELINE_ORDER = [
  "eingegangen",
  "in_pruefung",
  "einladung",
  "gespraech",
  "zusage",
  "absage",
  "zurueckgezogen",
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
      new Date(iso)
    );
  } catch {
    return iso;
  }
}

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

type Tab = "pipeline" | "create";

export default function BewerbertoolPage() {
  const { isLoading: authLoading, authorized } = useRequireOffice();
  const { user: me } = useAuth();

  const [tab, setTab] = useState<Tab>("pipeline");
  const [applicants, setApplicants] = useState<ApplicantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [emailDialog, setEmailDialog] = useState<{
    applicant: ApplicantRecord;
    template: "confirmation" | "invitation" | "rejection" | "offer";
  } | null>(null);
  const [emailNote, setEmailNote] = useState("");
  const [emailDate, setEmailDate] = useState("");
  const [emailSending, setEmailSending] = useState(false);

  // create form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPosition, setNewPosition] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newSendConfirmation, setNewSendConfirmation] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadApplicants = useCallback(async () => {
    setError("");
    try {
      const data = await getApplicants();
      setApplicants(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    loadApplicants();
  }, [authorized, loadApplicants]);

  const filtered = useMemo(() => {
    let list = applicants;
    if (filter !== "all") list = list.filter((a) => a.status === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          a.position.toLowerCase().includes(q)
      );
    }
    return list;
  }, [applicants, filter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: applicants.length };
    for (const a of applicants) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [applicants]);

  async function handleCreate() {
    if (!newName.trim() || !newEmail.trim() || !newPosition.trim()) return;
    setCreating(true);
    setFlash("");
    try {
      await createApplicant({
        name: newName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim() || null,
        position: newPosition.trim(),
        source: newSource.trim() || null,
        note: newNote.trim() || null,
        send_confirmation: newSendConfirmation,
      });
      setFlash(
        newSendConfirmation
          ? "Bewerber angelegt & Bestätigungsmail gesendet."
          : "Bewerber angelegt."
      );
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      setNewPosition("");
      setNewSource("");
      setNewNote("");
      setTab("pipeline");
      await loadApplicants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Anlegen");
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(id: number, status: string) {
    setBusyId(id);
    try {
      await updateApplicant(id, { status });
      await loadApplicants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Bewerber wirklich löschen?")) return;
    setBusyId(id);
    try {
      await deleteApplicant(id);
      await loadApplicants();
      setFlash("Bewerber gelöscht.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSendEmail() {
    if (!emailDialog) return;
    setEmailSending(true);
    try {
      await sendApplicantEmail(emailDialog.applicant.id, emailDialog.template, {
        interview_date: emailDate || undefined,
        note: emailNote || undefined,
      });
      setFlash(`E-Mail (${emailDialog.template}) an ${emailDialog.applicant.email} gesendet.`);
      setEmailDialog(null);
      setEmailNote("");
      setEmailDate("");
      await loadApplicants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "E-Mail-Fehler");
    } finally {
      setEmailSending(false);
    }
  }

  async function handleResumeUpload(id: number, file: File) {
    setBusyId(id);
    try {
      await uploadApplicantResume(id, file);
      await loadApplicants();
      setFlash("Datei hochgeladen.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload-Fehler");
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading || !authorized) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bewerbertool</h1>
          <p className="mt-1 text-sm text-slate-500">
            {applicants.length} Bewerber insgesamt
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab("create")}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            + Neuer Bewerber
          </button>
          <button
            onClick={loadApplicants}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {flash && (
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircleIcon className="h-4 w-4 shrink-0" />
          {flash}
          <button onClick={() => setFlash("")} className="ml-auto text-emerald-500 hover:text-emerald-700">
            &times;
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircleIcon className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError("")} className="ml-auto text-red-500 hover:text-red-700">
            &times;
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl bg-slate-100 p-1">
        <button
          onClick={() => setTab("pipeline")}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
            tab === "pipeline"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Pipeline
        </button>
        <button
          onClick={() => setTab("create")}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
            tab === "create"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Neuer Bewerber
        </button>
      </div>

      {tab === "create" && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold">Bewerber erfassen</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Name *</span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">E-Mail *</span>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Telefon</span>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Position *</span>
              <input
                type="text"
                value={newPosition}
                onChange={(e) => setNewPosition(e.target.value)}
                placeholder="z.B. Betreuungskraft, Bürokraft"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Quelle</span>
              <select
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
              >
                <option value="">— nicht angegeben —</option>
                <option value="indeed">Indeed</option>
                <option value="stepstone">StepStone</option>
                <option value="agentur">Agentur für Arbeit</option>
                <option value="empfehlung">Empfehlung</option>
                <option value="initiativ">Initiativbewerbung</option>
                <option value="website">Website</option>
                <option value="sonstige">Sonstige</option>
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-700">Notiz</span>
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 md:col-span-2">
              <input
                type="checkbox"
                checked={newSendConfirmation}
                onChange={(e) => setNewSendConfirmation(e.target.checked)}
                className="h-4 w-4"
              />
              Bestätigungsmail an Bewerber senden
            </label>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim() || !newEmail.trim() || !newPosition.trim()}
            className="mt-6 rounded-xl bg-slate-900 px-6 py-3 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? "Speichert..." : "Bewerber anlegen"}
          </button>
        </div>
      )}

      {tab === "pipeline" && (
        <>
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Suchen (Name, E-Mail, Position)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-sm rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            />
            <div className="flex flex-wrap gap-1">
              {["all", ...PIPELINE_ORDER].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    filter === s
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {s === "all" ? "Alle" : STATUS_LABELS[s] ?? s}
                  <span className="ml-1 opacity-60">({counts[s] ?? 0})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Pipeline stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {PIPELINE_ORDER.map((s) => (
              <div
                key={s}
                className="rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-sm"
              >
                <div className="text-2xl font-bold text-slate-900">
                  {counts[s] ?? 0}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {STATUS_LABELS[s]}
                </div>
              </div>
            ))}
          </div>

          {/* Applicant list */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-brand-600" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
              Keine Bewerber gefunden.
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((a) => (
                <div
                  key={a.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId(expandedId === a.id ? null : a.id)
                    }
                    className="flex w-full items-center gap-4 px-5 py-4 text-left"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                      {a.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900">
                        {a.name}
                      </div>
                      <div className="mt-0.5 text-sm text-slate-500">
                        {a.position} · {a.email}
                        {a.phone ? ` · ${a.phone}` : ""}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium ${
                        STATUS_COLORS[a.status] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {STATUS_LABELS[a.status] ?? a.status}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatDate(a.created_at)}
                    </span>
                  </button>

                  {expandedId === a.id && (
                    <div className="border-t border-slate-100 px-5 py-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        {/* Info */}
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="font-medium text-slate-700">Quelle:</span>{" "}
                            {a.source ?? "—"}
                          </div>
                          <div>
                            <span className="font-medium text-slate-700">Vorstellungsgespräch:</span>{" "}
                            {formatDateTime(a.interview_date)}
                          </div>
                          <div>
                            <span className="font-medium text-slate-700">Erstellt:</span>{" "}
                            {formatDateTime(a.created_at)}
                          </div>
                          {a.note && (
                            <div>
                              <span className="font-medium text-slate-700">Notiz:</span>{" "}
                              <span className="text-slate-600">{a.note}</span>
                            </div>
                          )}
                          {a.rejection_reason && (
                            <div>
                              <span className="font-medium text-slate-700">Absagegrund:</span>{" "}
                              <span className="text-slate-600">{a.rejection_reason}</span>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="space-y-3">
                          {/* Status change */}
                          <div>
                            <span className="mb-1 block text-xs font-medium text-slate-500">
                              Status ändern
                            </span>
                            <select
                              value={a.status}
                              onChange={(e) =>
                                handleStatusChange(a.id, e.target.value)
                              }
                              disabled={busyId === a.id}
                              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500"
                            >
                              {PIPELINE_ORDER.map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Email actions */}
                          <div>
                            <span className="mb-1 block text-xs font-medium text-slate-500">
                              E-Mail senden
                            </span>
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() =>
                                  setEmailDialog({ applicant: a, template: "confirmation" })
                                }
                                className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                              >
                                Bestätigung
                              </button>
                              <button
                                onClick={() =>
                                  setEmailDialog({ applicant: a, template: "invitation" })
                                }
                                className="rounded-lg bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition hover:bg-purple-100"
                              >
                                Einladung
                              </button>
                              <button
                                onClick={() =>
                                  setEmailDialog({ applicant: a, template: "offer" })
                                }
                                className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                              >
                                Zusage
                              </button>
                              <button
                                onClick={() =>
                                  setEmailDialog({ applicant: a, template: "rejection" })
                                }
                                className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
                              >
                                Absage
                              </button>
                            </div>
                          </div>

                          {/* Resume upload */}
                          <div>
                            <span className="mb-1 block text-xs font-medium text-slate-500">
                              Bewerbungsunterlagen
                            </span>
                            {a.resume_path ? (
                              <a
                                href={getApplicantResumeUrl(a.id)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm font-medium text-brand-600 hover:underline"
                              >
                                Unterlagen ansehen ↗
                              </a>
                            ) : (
                              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 transition hover:border-slate-400 hover:text-slate-700">
                                <input
                                  type="file"
                                  className="hidden"
                                  accept=".pdf,.doc,.docx"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleResumeUpload(a.id, file);
                                  }}
                                />
                                Datei hochladen
                              </label>
                            )}
                          </div>

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(a.id)}
                            disabled={busyId === a.id}
                            className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                          >
                            Bewerber löschen
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Email dialog */}
      {emailDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {emailDialog.template === "confirmation" && "Bestätigungsmail senden"}
              {emailDialog.template === "invitation" && "Einladung senden"}
              {emailDialog.template === "rejection" && "Absage senden"}
              {emailDialog.template === "offer" && "Zusage senden"}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              An: {emailDialog.applicant.name} ({emailDialog.applicant.email})
            </p>

            {emailDialog.template === "invitation" && (
              <label className="mt-4 block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Termin *
                </span>
                <input
                  type="datetime-local"
                  value={emailDate}
                  onChange={(e) => setEmailDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
                />
              </label>
            )}

            {(emailDialog.template === "invitation" ||
              emailDialog.template === "offer") && (
              <label className="mt-4 block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Zusätzliche Nachricht (optional)
                </span>
                <textarea
                  value={emailNote}
                  onChange={(e) => setEmailNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
                />
              </label>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleSendEmail}
                disabled={
                  emailSending ||
                  (emailDialog.template === "invitation" && !emailDate)
                }
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {emailSending ? "Sendet..." : "E-Mail senden"}
              </button>
              <button
                onClick={() => {
                  setEmailDialog(null);
                  setEmailNote("");
                  setEmailDate("");
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
