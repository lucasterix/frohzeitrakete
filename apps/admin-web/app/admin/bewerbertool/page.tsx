"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { useCachedFetch } from "@/lib/use-cached-fetch";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  RefreshIcon,
} from "@/components/icons";

const CALENDAR_URL = "https://calendar.app.google/nmXuFcbcPPLhxcHw8";

type KanbanCol = {
  id: string;
  label: string;
  color: string;
  bg: string;
  border: string;
  statuses: string[];
  emailTemplate?: string;
  needsDate?: boolean;
  dateLabel?: string;
};

const COLUMNS: KanbanCol[] = [
  { id: "neu", label: "Neu", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", statuses: ["eingegangen", "in_pruefung"] },
  { id: "einladung", label: "Einladung", color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200", statuses: ["einladung"], emailTemplate: "invitation", needsDate: true, dateLabel: "Gesprächstermin" },
  { id: "probearbeit", label: "Probearbeit", color: "text-cyan-700", bg: "bg-cyan-50", border: "border-cyan-200", statuses: ["probearbeit", "gespraech"], emailTemplate: "trial_work", needsDate: true, dateLabel: "Probearbeitstag" },
  { id: "zusage", label: "Zusage", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", statuses: ["zusage"], emailTemplate: "offer" },
  { id: "fuehrungszeugnis", label: "Führungszeugnis", color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", statuses: ["fuehrungszeugnis"], emailTemplate: "criminal_record" },
  { id: "vertrag", label: "Vertrag", color: "text-teal-700", bg: "bg-teal-50", border: "border-teal-200", statuses: ["vertrag"], emailTemplate: "contract" },
  { id: "eingestellt", label: "Eingestellt", color: "text-green-800", bg: "bg-green-50", border: "border-green-200", statuses: ["eingestellt"] },
  { id: "absage", label: "Absage", color: "text-red-700", bg: "bg-red-50", border: "border-red-200", statuses: ["absage", "zurueckgezogen"], emailTemplate: "rejection" },
];

const SOURCE_LABELS: Record<string, string> = {
  indeed: "Indeed", stepstone: "StepStone", agentur: "Agentur f. Arbeit",
  empfehlung: "Empfehlung", initiativ: "Initiativ", website: "Website", sonstige: "Sonstige",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(iso)); }
  catch { return iso; }
}

type View = "board" | "create" | "detail";

export default function BewerbertoolPage() {
  const { isLoading: authLoading, authorized } = useRequireOffice();
  const { user: me } = useAuth();

  const { data: applicants = [], mutate: mutateApplicants, isLoading: dataLoading } =
    useCachedFetch<ApplicantRecord[]>(authorized ? "bewerbertool/list" : null, getApplicants);

  const [view, setView] = useState<View>("board");
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // Email popup triggered by drop
  const [dropPopup, setDropPopup] = useState<{
    applicant: ApplicantRecord;
    column: KanbanCol;
  } | null>(null);
  const [popupDate, setPopupDate] = useState("");
  const [popupNote, setPopupNote] = useState("");
  const [popupSending, setPopupSending] = useState(false);

  // Create form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPosition, setNewPosition] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newDesiredHours, setNewDesiredHours] = useState("");
  const [newDesiredLocation, setNewDesiredLocation] = useState("");
  const [newAvailableFrom, setNewAvailableFrom] = useState("");
  const [newHasLicense, setNewHasLicense] = useState(false);
  const [newHasExperience, setNewHasExperience] = useState(false);
  const [newSendConfirmation, setNewSendConfirmation] = useState(true);
  const [creating, setCreating] = useState(false);

  const selected = useMemo(() => applicants.find((a) => a.id === selectedId) ?? null, [applicants, selectedId]);

  const colApplicants = useMemo(() => {
    const map: Record<string, ApplicantRecord[]> = {};
    for (const col of COLUMNS) map[col.id] = [];
    for (const a of applicants) {
      const col = COLUMNS.find((c) => c.statuses.includes(a.status));
      if (col) map[col.id].push(a);
    }
    return map;
  }, [applicants]);

  // Drag & Drop handlers
  function onDragStart(e: React.DragEvent, id: number) {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(id));
  }

  function onDragOver(e: React.DragEvent, colId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(colId);
  }

  function onDragLeave() {
    setDragOverCol(null);
  }

  async function onDrop(e: React.DragEvent, col: KanbanCol) {
    e.preventDefault();
    setDragOverCol(null);
    const id = parseInt(e.dataTransfer.getData("text/plain"));
    setDragId(null);
    if (!id) return;

    const applicant = applicants.find((a) => a.id === id);
    if (!applicant) return;
    if (col.statuses.includes(applicant.status)) return;

    if (col.emailTemplate) {
      setDropPopup({ applicant, column: col });
      setPopupDate("");
      setPopupNote("");
      return;
    }

    // No email needed — just update status
    setBusyId(id);
    try {
      await updateApplicant(id, { status: col.statuses[0] });
      await mutateApplicants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDropPopupSend() {
    if (!dropPopup) return;
    setPopupSending(true);
    try {
      await sendApplicantEmail(dropPopup.applicant.id, dropPopup.column.emailTemplate as any, {
        interview_date: dropPopup.column.dateLabel === "Gesprächstermin" ? popupDate : undefined,
        trial_date: dropPopup.column.dateLabel === "Probearbeitstag" ? popupDate : undefined,
        note: popupNote || undefined,
      });
      setFlash(`${dropPopup.column.label}-Mail an ${dropPopup.applicant.name} gesendet.`);
      setDropPopup(null);
      await mutateApplicants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "E-Mail-Fehler");
    } finally {
      setPopupSending(false);
    }
  }

  async function handleDropPopupSkip() {
    if (!dropPopup) return;
    setBusyId(dropPopup.applicant.id);
    try {
      await updateApplicant(dropPopup.applicant.id, { status: dropPopup.column.statuses[0] });
      setDropPopup(null);
      await mutateApplicants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate() {
    if (!newName.trim() || !newEmail.trim() || !newPosition.trim()) return;
    setCreating(true);
    setFlash(""); setError("");
    try {
      await createApplicant({
        name: newName.trim(), email: newEmail.trim(), phone: newPhone.trim() || null,
        position: newPosition.trim(), source: newSource || null, note: newNote.trim() || null,
        desired_hours: newDesiredHours ? parseFloat(newDesiredHours) : null,
        desired_location: newDesiredLocation.trim() || null,
        available_from: newAvailableFrom || null,
        has_drivers_license: newHasLicense || null,
        has_experience: newHasExperience || null,
        send_confirmation: newSendConfirmation,
      });
      setFlash(newSendConfirmation ? "Bewerber angelegt & Eingangsbestätigung versendet!" : "Bewerber angelegt.");
      setNewName(""); setNewEmail(""); setNewPhone(""); setNewPosition("");
      setNewSource(""); setNewNote(""); setNewDesiredHours(""); setNewDesiredLocation("");
      setNewAvailableFrom(""); setNewHasLicense(false); setNewHasExperience(false);
      setView("board");
      await mutateApplicants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Bewerber wirklich löschen?")) return;
    setBusyId(id);
    try {
      await deleteApplicant(id);
      if (selectedId === id) { setSelectedId(null); setView("board"); }
      await mutateApplicants();
      setFlash("Bewerber gelöscht.");
    } catch (err) { setError(err instanceof Error ? err.message : "Fehler"); }
    finally { setBusyId(null); }
  }

  async function handleFieldSave(id: number, field: string, value: unknown) {
    setBusyId(id);
    try {
      await updateApplicant(id, { [field]: value });
      await mutateApplicants();
    } catch (err) { setError(err instanceof Error ? err.message : "Fehler"); }
    finally { setBusyId(null); }
  }

  async function handleResumeUpload(id: number, file: File) {
    setBusyId(id);
    try {
      await uploadApplicantResume(id, file);
      await mutateApplicants();
      setFlash("Unterlagen hochgeladen.");
    } catch (err) { setError(err instanceof Error ? err.message : "Fehler"); }
    finally { setBusyId(null); }
  }

  if (authLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-brand-600" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bewerbertool</h1>
          <p className="mt-1 text-sm text-slate-500">{applicants.length} Bewerber · Karten per Drag &amp; Drop verschieben</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setView("create"); setSelectedId(null); }} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">+ Neuer Bewerber</button>
          {view !== "board" && <button onClick={() => { setView("board"); setSelectedId(null); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Board</button>}
          <button onClick={() => mutateApplicants()} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">
            <RefreshIcon className={`h-4 w-4 ${dataLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {flash && (
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircleIcon className="h-4 w-4 shrink-0" />{flash}
          <button onClick={() => setFlash("")} className="ml-auto">&times;</button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircleIcon className="h-4 w-4 shrink-0" />{error}
          <button onClick={() => setError("")} className="ml-auto">&times;</button>
        </div>
      )}

      {/* ─── Kanban Board ─── */}
      {view === "board" && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <div
              key={col.id}
              onDragOver={(e) => onDragOver(e, col.id)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, col)}
              className={`flex w-56 shrink-0 flex-col rounded-2xl border-2 transition-colors ${
                dragOverCol === col.id ? `${col.border} ${col.bg}` : "border-transparent bg-slate-50/80"
              }`}
            >
              {/* Column header */}
              <div className={`flex items-center justify-between rounded-t-2xl px-3 py-2.5 ${col.bg}`}>
                <span className={`text-xs font-bold uppercase tracking-wider ${col.color}`}>{col.label}</span>
                <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${col.bg} ${col.color}`}>
                  {colApplicants[col.id]?.length ?? 0}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-1 flex-col gap-2 p-2" style={{ minHeight: 80 }}>
                {(colApplicants[col.id] ?? []).map((a) => (
                  <div
                    key={a.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, a.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => { setSelectedId(a.id); setView("detail"); }}
                    className={`cursor-grab rounded-xl border bg-white p-3 shadow-sm transition active:cursor-grabbing hover:shadow-md ${
                      dragId === a.id ? "opacity-40" : ""
                    } ${busyId === a.id ? "opacity-60" : ""}`}
                  >
                    <div className="text-sm font-semibold text-slate-900 leading-tight">{a.name}</div>
                    <div className="mt-1 text-[11px] text-slate-500 leading-tight">{a.position}</div>
                    {a.desired_hours && <div className="mt-1 text-[10px] text-slate-400">{a.desired_hours}h/Wo</div>}
                    {a.source && <div className="mt-1 text-[10px] text-slate-400">{SOURCE_LABELS[a.source] ?? a.source}</div>}
                    <div className="mt-1.5 text-[10px] text-slate-300">{fmtDate(a.created_at)}</div>
                  </div>
                ))}
                {(colApplicants[col.id] ?? []).length === 0 && (
                  <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 p-4 text-[11px] text-slate-300">
                    Hierher ziehen
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Create Form ─── */}
      {view === "create" && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold">Bewerber erfassen</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Inp label="Name *" value={newName} set={setNewName} />
            <Inp label="E-Mail *" value={newEmail} set={setNewEmail} type="email" />
            <Inp label="Telefon" value={newPhone} set={setNewPhone} type="tel" />
            <Inp label="Position *" value={newPosition} set={setNewPosition} ph="z.B. Betreuungskraft" />
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Quelle</span>
              <select value={newSource} onChange={(e) => setNewSource(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500">
                <option value="">—</option>
                {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <Inp label="Stunden/Woche" value={newDesiredHours} set={setNewDesiredHours} type="number" ph="z.B. 30" />
            <Inp label="Standort" value={newDesiredLocation} set={setNewDesiredLocation} ph="z.B. Göttingen" />
            <Inp label="Verfügbar ab" value={newAvailableFrom} set={setNewAvailableFrom} type="date" />
            <div className="space-y-2 md:col-span-2">
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={newHasLicense} onChange={(e) => setNewHasLicense(e.target.checked)} className="h-4 w-4" />Führerschein</label>
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={newHasExperience} onChange={(e) => setNewHasExperience(e.target.checked)} className="h-4 w-4" />Berufserfahrung</label>
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={newSendConfirmation} onChange={(e) => setNewSendConfirmation(e.target.checked)} className="h-4 w-4" />Eingangsbestätigung senden (mit Termin-Link)</label>
            </div>
            <label className="block md:col-span-2"><span className="mb-1 block text-sm font-medium text-slate-700">Notiz</span>
              <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={2} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500" />
            </label>
          </div>
          <button onClick={handleCreate} disabled={creating || !newName.trim() || !newEmail.trim() || !newPosition.trim()}
            className="mt-5 rounded-xl bg-slate-900 px-6 py-3 font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {creating ? "Speichert..." : "Bewerber anlegen"}
          </button>
        </div>
      )}

      {/* ─── Detail View ─── */}
      {view === "detail" && selected && (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Left 3 cols */}
          <div className="space-y-5 lg:col-span-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{selected.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{selected.email}{selected.phone ? ` · ${selected.phone}` : ""}</p>
                </div>
                <span className={`rounded-lg px-3 py-1.5 text-xs font-bold ${COLUMNS.find(c => c.statuses.includes(selected.status))?.bg ?? "bg-slate-100"} ${COLUMNS.find(c => c.statuses.includes(selected.status))?.color ?? ""}`}>
                  {COLUMNS.find(c => c.statuses.includes(selected.status))?.label ?? selected.status}
                </span>
              </div>
            </div>

            <Sec title="Bewerberdaten">
              <Row label="Position" value={selected.position} />
              <Row label="Quelle" value={SOURCE_LABELS[selected.source ?? ""] ?? selected.source ?? "—"} />
              <Row label="Stunden/Woche" value={selected.desired_hours ? `${selected.desired_hours}h` : "—"} />
              <Row label="Standort" value={selected.desired_location ?? "—"} />
              <Row label="Verfügbar ab" value={selected.available_from ?? "—"} />
              <Row label="Führerschein" value={selected.has_drivers_license ? "Ja" : "—"} />
              <Row label="Erfahrung" value={selected.has_experience ? "Ja" : "—"} />
              {selected.note && <Row label="Notiz" value={selected.note} />}
            </Sec>

            <Sec title="Einstellung">
              <EditRow label="Probearbeit" value={selected.trial_work_date?.slice(0, 10) ?? ""} onSave={(v) => handleFieldSave(selected.id, "trial_work_date", v ? new Date(v).toISOString() : null)} type="date" display={fmtDate(selected.trial_work_date)} />
              <EditRow label="FZ beantragt" value={selected.criminal_record_requested_at?.slice(0, 10) ?? ""} onSave={(v) => handleFieldSave(selected.id, "criminal_record_requested_at", v ? new Date(v).toISOString() : null)} type="date" display={fmtDate(selected.criminal_record_requested_at)} />
              <EditRow label="FZ eingegangen" value={selected.criminal_record_received_at?.slice(0, 10) ?? ""} onSave={(v) => handleFieldSave(selected.id, "criminal_record_received_at", v ? new Date(v).toISOString() : null)} type="date" display={fmtDate(selected.criminal_record_received_at)} />
              <EditRow label="Stunden (eingestellt)" value={selected.hired_hours?.toString() ?? ""} onSave={(v) => handleFieldSave(selected.id, "hired_hours", v ? parseFloat(v) : null)} type="number" display={selected.hired_hours ? `${selected.hired_hours}h` : "—"} />
              <EditRow label="Standort (eingestellt)" value={selected.hired_location ?? ""} onSave={(v) => handleFieldSave(selected.id, "hired_location", v || null)} display={selected.hired_location ?? "—"} />
              <EditRow label="Startdatum" value={selected.start_date ?? ""} onSave={(v) => handleFieldSave(selected.id, "start_date", v || null)} type="date" display={selected.start_date ?? "—"} />
            </Sec>

            <Sec title="Unterlagen">
              {selected.resume_path ? (
                <a href={getApplicantResumeUrl(selected.id)} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-600 hover:underline">Unterlagen ansehen ↗</a>
              ) : (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700">
                  <input type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleResumeUpload(selected.id, f); }} />
                  Datei hochladen
                </label>
              )}
            </Sec>
          </div>

          {/* Right 2 cols */}
          <div className="space-y-5 lg:col-span-2">
            <Sec title="E-Mails senden">
              <div className="space-y-2">
                {[
                  { tpl: "confirmation" as const, label: "Eingangsbestätigung", sent: selected.confirmation_sent_at, color: "blue" },
                  { tpl: "invitation" as const, label: "Einladung Gespräch", sent: selected.invitation_sent_at, color: "purple", needsDate: true },
                  { tpl: "trial_work" as const, label: "Probearbeit-Einladung", sent: null, color: "cyan", needsDate: true },
                  { tpl: "offer" as const, label: "Zusage", sent: selected.offer_sent_at, color: "emerald" },
                  { tpl: "criminal_record" as const, label: "Führungszeugnis anfordern", sent: null, color: "orange" },
                  { tpl: "contract" as const, label: "Vertragsinfo", sent: selected.contract_sent_at, color: "teal" },
                  { tpl: "rejection" as const, label: "Absage", sent: selected.rejection_sent_at, color: "red" },
                ].map(({ tpl, label, sent, color, needsDate }) => (
                  <button key={tpl}
                    onClick={() => {
                      setDropPopup({
                        applicant: selected,
                        column: COLUMNS.find(c => c.emailTemplate === tpl) ?? { id: tpl, label, color: "", bg: "", border: "", statuses: [], emailTemplate: tpl, needsDate }
                      });
                      setPopupDate(""); setPopupNote("");
                    }}
                    className={`flex w-full items-center justify-between rounded-xl bg-${color}-50 px-3 py-2.5 text-left text-xs font-medium text-${color}-700 transition hover:bg-${color}-100`}
                  >
                    <span>{label}</span>
                    {sent && <span className="text-[10px] font-normal opacity-60">{fmtDate(sent)}</span>}
                  </button>
                ))}
              </div>
            </Sec>

            <Sec title="Verlauf">
              <div className="space-y-1.5 text-xs">
                {[
                  { d: selected.created_at, l: "Eingegangen" },
                  { d: selected.confirmation_sent_at, l: "Bestätigung gesendet" },
                  { d: selected.invitation_sent_at, l: "Einladung gesendet" },
                  { d: selected.interview_date, l: "Gespräch" },
                  { d: selected.trial_work_date, l: "Probearbeit" },
                  { d: selected.offer_sent_at, l: "Zusage gesendet" },
                  { d: selected.criminal_record_requested_at, l: "FZ beantragt" },
                  { d: selected.criminal_record_received_at, l: "FZ eingegangen" },
                  { d: selected.contract_sent_at, l: "Vertrag gesendet" },
                  { d: selected.hired_at, l: "Eingestellt" },
                  { d: selected.rejection_sent_at, l: "Absage gesendet" },
                ].filter((e) => e.d).map((e, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    <span className="text-slate-600">{e.l}</span>
                    <span className="ml-auto text-slate-400">{fmtDate(e.d)}</span>
                  </div>
                ))}
              </div>
            </Sec>

            <EditRow label="Notiz" value={selected.note ?? ""} onSave={(v) => handleFieldSave(selected.id, "note", v || null)} type="textarea" display={selected.note || "—"} />

            <button onClick={() => handleDelete(selected.id)} disabled={busyId === selected.id}
              className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50">
              Bewerber löschen
            </button>
          </div>
        </div>
      )}

      {/* ─── Drop Email Popup ─── */}
      {dropPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {dropPopup.column.label}-Mail senden?
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              An: <strong>{dropPopup.applicant.name}</strong> ({dropPopup.applicant.email})
            </p>

            {dropPopup.column.needsDate && (
              <label className="mt-4 block">
                <span className="mb-1 block text-sm font-medium text-slate-700">{dropPopup.column.dateLabel} *</span>
                <input type="datetime-local" value={popupDate} onChange={(e) => setPopupDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500" />
                <p className="mt-1 text-xs text-slate-400">
                  Bewerber erhält auch den <a href={CALENDAR_URL} target="_blank" rel="noreferrer" className="text-brand-600 underline">Kalender-Link</a> zum Umbuchen.
                </p>
              </label>
            )}

            {(dropPopup.column.emailTemplate === "offer" || dropPopup.column.emailTemplate === "contract") && (
              <label className="mt-4 block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Zusätzliche Info (optional)</span>
                <textarea value={popupNote} onChange={(e) => setPopupNote(e.target.value)} rows={3}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500" />
              </label>
            )}

            <div className="mt-6 flex gap-3">
              <button onClick={handleDropPopupSend}
                disabled={popupSending || (!!dropPopup.column.needsDate && !popupDate)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {popupSending ? "Sendet..." : "Mail senden & verschieben"}
              </button>
              <button onClick={handleDropPopupSkip}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Nur verschieben
              </button>
              <button onClick={() => setDropPopup(null)}
                className="rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-slate-600">
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Helpers ── */

function Inp({ label, value, set, type = "text", ph }: { label: string; value: string; set: (v: string) => void; type?: string; ph?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input type={type} value={value} onChange={(e) => set(e.target.value)} placeholder={ph}
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500" />
    </label>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-50 py-1.5 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{value}</span>
    </div>
  );
}

function EditRow({ label, value, onSave, type = "text", display }: {
  label: string; value: string; onSave: (v: string) => void; type?: string; display: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);

  if (!editing) {
    return (
      <div className="flex items-center justify-between border-b border-slate-50 py-1.5 text-sm last:border-0">
        <span className="text-slate-500">{label}</span>
        <button onClick={() => setEditing(true)} className="text-right text-xs text-brand-600 hover:underline">
          {display || "Eintragen"}
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-slate-50 py-2 last:border-0">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {type === "textarea" ? (
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
          className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500" />
      ) : (
        <input type={type} value={draft} onChange={(e) => setDraft(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500" />
      )}
      <div className="mt-1.5 flex gap-2">
        <button onClick={() => { onSave(draft); setEditing(false); }} className="rounded-lg bg-slate-900 px-3 py-1 text-xs text-white">OK</button>
        <button onClick={() => { setDraft(value); setEditing(false); }} className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600">Abbrechen</button>
      </div>
    </div>
  );
}
