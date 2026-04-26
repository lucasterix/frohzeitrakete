"use client";

import { useEffect, useMemo, useState } from "react";
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

/* ── Column definitions with STATIC Tailwind classes ── */

type ColDef = {
  id: string;
  label: string;
  emoji: string;
  statuses: string[];
  headerCls: string;
  countCls: string;
  dropCls: string;
  emailTemplate?: string;
  needsDate?: boolean;
  dateLabel?: string;
};

const COLS: ColDef[] = [
  {
    id: "neu", label: "Neu", emoji: "📥", statuses: ["eingegangen", "in_pruefung"],
    headerCls: "bg-blue-600 text-white", countCls: "bg-blue-500 text-white", dropCls: "ring-blue-400 bg-blue-50",
  },
  {
    id: "einladung", label: "Einladung", emoji: "📩", statuses: ["einladung"],
    headerCls: "bg-purple-600 text-white", countCls: "bg-purple-500 text-white", dropCls: "ring-purple-400 bg-purple-50",
    emailTemplate: "invitation", needsDate: true, dateLabel: "Gesprächstermin",
  },
  {
    id: "probearbeit", label: "Probearbeit", emoji: "🧪", statuses: ["probearbeit", "gespraech"],
    headerCls: "bg-cyan-600 text-white", countCls: "bg-cyan-500 text-white", dropCls: "ring-cyan-400 bg-cyan-50",
    emailTemplate: "trial_work", needsDate: true, dateLabel: "Probearbeitstag",
  },
  {
    id: "zusage", label: "Zusage", emoji: "🎉", statuses: ["zusage"],
    headerCls: "bg-emerald-600 text-white", countCls: "bg-emerald-500 text-white", dropCls: "ring-emerald-400 bg-emerald-50",
    emailTemplate: "offer",
  },
  {
    id: "fz", label: "Führungszeugnis", emoji: "📋", statuses: ["fuehrungszeugnis"],
    headerCls: "bg-orange-500 text-white", countCls: "bg-orange-400 text-white", dropCls: "ring-orange-400 bg-orange-50",
    emailTemplate: "criminal_record",
  },
  {
    id: "vertrag", label: "Vertrag", emoji: "📝", statuses: ["vertrag"],
    headerCls: "bg-teal-600 text-white", countCls: "bg-teal-500 text-white", dropCls: "ring-teal-400 bg-teal-50",
    emailTemplate: "contract",
  },
  {
    id: "eingestellt", label: "Eingestellt", emoji: "✅", statuses: ["eingestellt"],
    headerCls: "bg-green-700 text-white", countCls: "bg-green-600 text-white", dropCls: "ring-green-400 bg-green-50",
  },
  {
    id: "absage", label: "Absage", emoji: "❌", statuses: ["absage", "zurueckgezogen"],
    headerCls: "bg-slate-500 text-white", countCls: "bg-slate-400 text-white", dropCls: "ring-slate-400 bg-slate-100",
    emailTemplate: "rejection",
  },
];

const SOURCES: Record<string, string> = {
  indeed: "Indeed", stepstone: "StepStone", agentur: "Agentur f. Arbeit",
  empfehlung: "Empfehlung", initiativ: "Initiativ", website: "Website", sonstige: "Sonstige",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(iso)); }
  catch { return iso; }
}

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

type View = "board" | "create" | "detail";

export default function BewerbertoolPage() {
  const { isLoading: authLoading, authorized } = useRequireOffice();
  useAuth();

  const { data: applicants = [], mutate: mutateApplicants, isLoading: dataLoading } =
    useCachedFetch<ApplicantRecord[]>(authorized ? "bewerbertool/list" : null, getApplicants);

  const [view, setView] = useState<View>("board");
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const [popup, setPopup] = useState<{ applicant: ApplicantRecord; col: ColDef } | null>(null);
  const [popupDate, setPopupDate] = useState("");
  const [popupNote, setPopupNote] = useState("");
  const [popupSending, setPopupSending] = useState(false);

  const [f, setF] = useState({ name: "", email: "", phone: "", position: "", source: "", note: "", hours: "", location: "", from: "", license: false, exp: false, confirm: true });
  const [creating, setCreating] = useState(false);

  const selected = useMemo(() => applicants.find((a) => a.id === selectedId) ?? null, [applicants, selectedId]);
  const colMap = useMemo(() => {
    const m: Record<string, ApplicantRecord[]> = {};
    for (const c of COLS) m[c.id] = [];
    for (const a of applicants) {
      const c = COLS.find((c) => c.statuses.includes(a.status));
      if (c) m[c.id].push(a);
    }
    return m;
  }, [applicants]);

  function onDragStart(e: React.DragEvent, id: number) {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(id));
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.4";
    }
  }
  function onDragEnd(e: React.DragEvent) {
    setDragId(null);
    setDragOverCol(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
  }
  function onDragOver(e: React.DragEvent, colId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverCol !== colId) setDragOverCol(colId);
  }
  async function onDrop(e: React.DragEvent, col: ColDef) {
    e.preventDefault();
    setDragOverCol(null);
    setDragId(null);
    const id = parseInt(e.dataTransfer.getData("text/plain"));
    if (!id) return;
    const a = applicants.find((x) => x.id === id);
    if (!a || col.statuses.includes(a.status)) return;

    if (col.emailTemplate) {
      setPopup({ applicant: a, col });
      setPopupDate(""); setPopupNote("");
    } else {
      setBusyId(id);
      try { await updateApplicant(id, { status: col.statuses[0] }); await mutateApplicants(); }
      catch (err) { setError(err instanceof Error ? err.message : "Fehler"); }
      finally { setBusyId(null); }
    }
  }

  async function popupSend() {
    if (!popup) return;
    setPopupSending(true);
    try {
      await sendApplicantEmail(popup.applicant.id, popup.col.emailTemplate as any, {
        interview_date: popup.col.dateLabel === "Gesprächstermin" ? popupDate : undefined,
        trial_date: popup.col.dateLabel === "Probearbeitstag" ? popupDate : undefined,
        note: popupNote || undefined,
      });
      setFlash(`${popup.col.label}-Mail an ${popup.applicant.name} gesendet`);
      setPopup(null); await mutateApplicants();
    } catch (err) { setError(err instanceof Error ? err.message : "Fehler"); }
    finally { setPopupSending(false); }
  }
  async function popupSkip() {
    if (!popup) return;
    setBusyId(popup.applicant.id);
    try { await updateApplicant(popup.applicant.id, { status: popup.col.statuses[0] }); setPopup(null); await mutateApplicants(); }
    catch (err) { setError(err instanceof Error ? err.message : "Fehler"); }
    finally { setBusyId(null); }
  }

  async function handleCreate() {
    if (!f.name.trim() || !f.email.trim() || !f.position.trim()) return;
    setCreating(true); setFlash(""); setError("");
    try {
      await createApplicant({
        name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() || null,
        position: f.position.trim(), source: f.source || null, note: f.note.trim() || null,
        desired_hours: f.hours ? parseFloat(f.hours) : null, desired_location: f.location.trim() || null,
        available_from: f.from || null, has_drivers_license: f.license || null,
        has_experience: f.exp || null, send_confirmation: f.confirm,
      });
      setFlash(f.confirm ? "Bewerber angelegt & Bestätigung gesendet!" : "Bewerber angelegt.");
      setF({ name: "", email: "", phone: "", position: "", source: "", note: "", hours: "", location: "", from: "", license: false, exp: false, confirm: true });
      setView("board"); await mutateApplicants();
    } catch (err) { setError(err instanceof Error ? err.message : "Fehler"); }
    finally { setCreating(false); }
  }

  async function save(id: number, field: string, value: unknown) {
    setBusyId(id);
    try { await updateApplicant(id, { [field]: value }); await mutateApplicants(); }
    catch (err) { setError(err instanceof Error ? err.message : "Fehler"); }
    finally { setBusyId(null); }
  }

  if (authLoading) return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-brand-600" /></div>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bewerbertool</h1>
          <p className="text-sm text-slate-500">{applicants.length} Bewerber · Karten per Drag &amp; Drop verschieben</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setView("create"); setSelectedId(null); }} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">+ Neuer Bewerber</button>
          {view !== "board" && <button onClick={() => { setView("board"); setSelectedId(null); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">← Board</button>}
          <button onClick={() => mutateApplicants()} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50">
            <RefreshIcon className={`h-4 w-4 text-slate-600 ${dataLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {flash && <Banner type="ok" msg={flash} onClose={() => setFlash("")} />}
      {error && <Banner type="err" msg={error} onClose={() => setError("")} />}

      {/* ═══ KANBAN BOARD ═══ */}
      {view === "board" && (
        <div className="-mx-4 overflow-x-auto px-4 lg:-mx-8 lg:px-8">
          <div className="inline-flex gap-3 pb-6" style={{ minWidth: "100%" }}>
            {COLS.map((col) => {
              const items = colMap[col.id] ?? [];
              const isOver = dragOverCol === col.id;
              return (
                <div
                  key={col.id}
                  onDragOver={(e) => onDragOver(e, col.id)}
                  onDragLeave={() => { if (dragOverCol === col.id) setDragOverCol(null); }}
                  onDrop={(e) => onDrop(e, col)}
                  className={`flex w-[200px] shrink-0 flex-col rounded-2xl transition-all duration-150 xl:w-[220px] ${
                    isOver ? `ring-2 ${col.dropCls}` : "bg-slate-50"
                  }`}
                  style={{ minHeight: 320 }}
                >
                  {/* Col header */}
                  <div className={`flex items-center gap-2 rounded-t-2xl px-3 py-2.5 ${col.headerCls}`}>
                    <span className="text-base">{col.emoji}</span>
                    <span className="flex-1 text-xs font-bold uppercase tracking-wider">{col.label}</span>
                    <span className={`grid h-5 min-w-[20px] place-items-center rounded-full px-1 text-[10px] font-bold ${col.countCls}`}>{items.length}</span>
                  </div>

                  {/* Cards */}
                  <div className="flex flex-1 flex-col gap-2 p-2">
                    {items.map((a) => (
                      <div
                        key={a.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, a.id)}
                        onDragEnd={onDragEnd}
                        onClick={() => { setSelectedId(a.id); setView("detail"); }}
                        className={`group cursor-grab select-none rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:cursor-grabbing active:shadow-lg ${
                          busyId === a.id ? "opacity-50 pointer-events-none" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-[11px] font-bold text-white shadow-sm">
                            {initials(a.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold leading-tight text-slate-900">{a.name}</div>
                            <div className="truncate text-[11px] leading-tight text-slate-500">{a.position}</div>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {a.desired_hours != null && (
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{a.desired_hours}h</span>
                          )}
                          {a.source && (
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{SOURCES[a.source] ?? a.source}</span>
                          )}
                          {a.has_drivers_license && (
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px]">🚗</span>
                          )}
                        </div>
                        <div className="mt-1.5 text-[10px] text-slate-400">{fmtDate(a.created_at)}</div>
                      </div>
                    ))}

                    {items.length === 0 && (
                      <div className={`flex flex-1 items-center justify-center rounded-xl border-2 border-dashed p-3 text-center text-[11px] transition-colors ${
                        isOver ? "border-slate-400 text-slate-500" : "border-slate-200 text-slate-300"
                      }`}>
                        {isOver ? "Loslassen!" : "Hierher ziehen"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ CREATE FORM ═══ */}
      {view === "create" && (
        <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Neuer Bewerber</h2>
          <p className="mt-1 text-sm text-slate-500">Bewerber erfassen — Eingangsbestätigung wird automatisch per Mail gesendet.</p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <FInput label="Name *" value={f.name} set={(v) => setF({ ...f, name: v })} />
            <FInput label="E-Mail *" value={f.email} set={(v) => setF({ ...f, email: v })} type="email" />
            <FInput label="Telefon" value={f.phone} set={(v) => setF({ ...f, phone: v })} type="tel" />
            <FInput label="Position *" value={f.position} set={(v) => setF({ ...f, position: v })} ph="z.B. Betreuungskraft" />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Quelle</span>
              <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200">
                <option value="">—</option>
                {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <FInput label="Stunden/Woche" value={f.hours} set={(v) => setF({ ...f, hours: v })} type="number" ph="z.B. 30" />
            <FInput label="Standort" value={f.location} set={(v) => setF({ ...f, location: v })} ph="z.B. Göttingen" />
            <FInput label="Verfügbar ab" value={f.from} set={(v) => setF({ ...f, from: v })} type="date" />
            <div className="space-y-3 sm:col-span-2">
              <Chk checked={f.license} set={(v) => setF({ ...f, license: v })} label="Führerschein vorhanden" />
              <Chk checked={f.exp} set={(v) => setF({ ...f, exp: v })} label="Berufserfahrung in Pflege/Betreuung" />
            </div>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Notiz</span>
              <textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
            </label>
            <div className="sm:col-span-2">
              <Chk checked={f.confirm} set={(v) => setF({ ...f, confirm: v })} label="Eingangsbestätigung per Mail senden (mit Termin-Buchungslink)" />
            </div>
          </div>
          <button onClick={handleCreate} disabled={creating || !f.name.trim() || !f.email.trim() || !f.position.trim()}
            className="mt-6 w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-8">
            {creating ? "Speichert..." : "Bewerber anlegen"}
          </button>
        </div>
      )}

      {/* ═══ DETAIL VIEW ═══ */}
      {view === "detail" && selected && (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-5 lg:col-span-3">
            {/* Profile card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-bold text-white shadow-lg shadow-brand-600/20">
                  {initials(selected.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold text-slate-900">{selected.name}</h2>
                  <p className="text-sm text-slate-500">{selected.email}{selected.phone ? ` · ${selected.phone}` : ""}</p>
                  <p className="mt-1 text-sm text-slate-600">{selected.position}</p>
                </div>
                <span className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold ${COLS.find((c) => c.statuses.includes(selected.status))?.headerCls ?? "bg-slate-200"}`}>
                  {COLS.find((c) => c.statuses.includes(selected.status))?.label ?? selected.status}
                </span>
              </div>
            </div>

            <Sec title="Bewerberdaten">
              <Row l="Position" v={selected.position} />
              <Row l="Quelle" v={SOURCES[selected.source ?? ""] ?? selected.source ?? "—"} />
              <Row l="Stunden" v={selected.desired_hours ? `${selected.desired_hours}h/Wo` : "—"} />
              <Row l="Standort" v={selected.desired_location ?? "—"} />
              <Row l="Verfügbar ab" v={selected.available_from ?? "—"} />
              <Row l="Führerschein" v={selected.has_drivers_license ? "Ja" : "—"} />
              <Row l="Erfahrung" v={selected.has_experience ? "Ja" : "—"} />
              {selected.note && <Row l="Notiz" v={selected.note} />}
            </Sec>

            <Sec title="Einstellung">
              <ERow l="Probearbeit" v={selected.trial_work_date?.slice(0, 10) ?? ""} d={fmtDate(selected.trial_work_date)} t="date" save={(v) => save(selected.id, "trial_work_date", v ? new Date(v).toISOString() : null)} />
              <ERow l="FZ beantragt" v={selected.criminal_record_requested_at?.slice(0, 10) ?? ""} d={fmtDate(selected.criminal_record_requested_at)} t="date" save={(v) => save(selected.id, "criminal_record_requested_at", v ? new Date(v).toISOString() : null)} />
              <ERow l="FZ eingegangen" v={selected.criminal_record_received_at?.slice(0, 10) ?? ""} d={fmtDate(selected.criminal_record_received_at)} t="date" save={(v) => save(selected.id, "criminal_record_received_at", v ? new Date(v).toISOString() : null)} />
              <ERow l="Stunden" v={selected.hired_hours?.toString() ?? ""} d={selected.hired_hours ? `${selected.hired_hours}h` : "—"} t="number" save={(v) => save(selected.id, "hired_hours", v ? parseFloat(v) : null)} />
              <ERow l="Standort" v={selected.hired_location ?? ""} d={selected.hired_location ?? "—"} save={(v) => save(selected.id, "hired_location", v || null)} />
              <ERow l="Rolle" v={selected.hired_role ?? ""} d={selected.hired_role ?? "—"} save={(v) => save(selected.id, "hired_role", v || null)} />
              <ERow l="Startdatum" v={selected.start_date ?? ""} d={selected.start_date ?? "—"} t="date" save={(v) => save(selected.id, "start_date", v || null)} />
            </Sec>

            <Sec title="Unterlagen">
              {selected.resume_path ? (
                <a href={getApplicantResumeUrl(selected.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-700 transition hover:bg-brand-100">📄 Unterlagen ansehen</a>
              ) : (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 transition hover:border-brand-400 hover:text-brand-600">
                  <input type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={(e) => { const file = e.target.files?.[0]; if (file) { uploadApplicantResume(selected.id, file).then(() => mutateApplicants()); } }} />
                  📎 Datei hochladen (PDF, DOC)
                </label>
              )}
            </Sec>
          </div>

          <div className="space-y-5 lg:col-span-2">
            <Sec title="E-Mails">
              <div className="space-y-1.5">
                <MailBtn label="📥 Eingangsbestätigung" sent={selected.confirmation_sent_at} onClick={() => { setPopup({ applicant: selected, col: { ...COLS[0], emailTemplate: "confirmation" } }); }} />
                <MailBtn label="📩 Einladung Gespräch" sent={selected.invitation_sent_at} onClick={() => { setPopup({ applicant: selected, col: COLS[1] }); setPopupDate(""); }} />
                <MailBtn label="🧪 Probearbeit" onClick={() => { setPopup({ applicant: selected, col: COLS[2] }); setPopupDate(""); }} />
                <MailBtn label="🎉 Zusage" sent={selected.offer_sent_at} onClick={() => { setPopup({ applicant: selected, col: COLS[3] }); }} />
                <MailBtn label="📋 Führungszeugnis" onClick={() => { setPopup({ applicant: selected, col: COLS[4] }); }} />
                <MailBtn label="📝 Vertrag" sent={selected.contract_sent_at} onClick={() => { setPopup({ applicant: selected, col: COLS[5] }); }} />
                <MailBtn label="❌ Absage" sent={selected.rejection_sent_at} onClick={() => { setPopup({ applicant: selected, col: COLS[7] }); }} />
              </div>
            </Sec>

            <Sec title="Verlauf">
              <div className="space-y-1">
                {[
                  [selected.created_at, "Eingegangen"],
                  [selected.confirmation_sent_at, "Bestätigung gesendet"],
                  [selected.invitation_sent_at, "Einladung gesendet"],
                  [selected.interview_date, "Gespräch"],
                  [selected.trial_work_date, "Probearbeit"],
                  [selected.offer_sent_at, "Zusage gesendet"],
                  [selected.criminal_record_requested_at, "FZ beantragt"],
                  [selected.criminal_record_received_at, "FZ eingegangen"],
                  [selected.contract_sent_at, "Vertrag gesendet"],
                  [selected.hired_at, "Eingestellt"],
                  [selected.rejection_sent_at, "Absage gesendet"],
                ].filter(([d]) => d).map(([d, l], i) => (
                  <div key={i} className="flex items-center gap-2 py-0.5 text-xs">
                    <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    <span className="flex-1 text-slate-600">{l as string}</span>
                    <span className="text-slate-400">{fmtDate(d as string)}</span>
                  </div>
                ))}
              </div>
            </Sec>

            <ERow l="Notiz" v={selected.note ?? ""} d={selected.note || "Keine Notiz"} t="textarea" save={(v) => save(selected.id, "note", v || null)} />

            <button onClick={() => { if (confirm("Löschen?")) { deleteApplicant(selected.id).then(() => { setSelectedId(null); setView("board"); mutateApplicants(); }); } }}
              className="w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-100">
              Bewerber löschen
            </button>
          </div>
        </div>
      )}

      {/* ═══ EMAIL POPUP ═══ */}
      {popup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setPopup(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{popup.col.emoji}</span>
              <div>
                <h3 className="text-lg font-bold text-slate-900">{popup.col.label}-Mail senden?</h3>
                <p className="text-sm text-slate-500">An: {popup.applicant.name} ({popup.applicant.email})</p>
              </div>
            </div>

            {popup.col.needsDate && (
              <label className="mt-5 block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">{popup.col.dateLabel} *</span>
                <input type="datetime-local" value={popupDate} onChange={(e) => setPopupDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
                <a href={CALENDAR_URL} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-xs text-brand-600 hover:underline">
                  📅 Bewerber kann auch über den Kalender-Link umbuchen
                </a>
              </label>
            )}

            {(popup.col.emailTemplate === "offer" || popup.col.emailTemplate === "contract") && (
              <label className="mt-4 block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Zusatzinfo (optional)</span>
                <textarea value={popupNote} onChange={(e) => setPopupNote(e.target.value)} rows={3}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
              </label>
            )}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button onClick={popupSend} disabled={popupSending || (!!popup.col.needsDate && !popupDate)}
                className="flex-1 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50">
                {popupSending ? "Sendet..." : `${popup.col.emoji} Mail senden`}
              </button>
              <button onClick={popupSkip}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                Nur verschieben
              </button>
              <button onClick={() => setPopup(null)}
                className="rounded-xl py-2.5 text-sm text-slate-400 transition hover:text-slate-600 sm:px-4">
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Reusable UI ── */

function Banner({ type, msg, onClose }: { type: "ok" | "err"; msg: string; onClose: () => void }) {
  const cls = type === "ok" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200";
  const Icon = type === "ok" ? CheckCircleIcon : AlertCircleIcon;
  return (
    <div className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${cls}`}>
      <Icon className="h-4 w-4 shrink-0" /><span className="flex-1">{msg}</span>
      <button onClick={onClose} className="ml-2 text-lg leading-none opacity-50 hover:opacity-100">&times;</button>
    </div>
  );
}

function FInput({ label, value, set, type = "text", ph }: { label: string; value: string; set: (v: string) => void; type?: string; ph?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <input type={type} value={value} onChange={(e) => set(e.target.value)} placeholder={ph}
        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
    </label>
  );
}

function Chk({ checked, set, label }: { checked: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
      {label}
    </label>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">{title}</h3>
      {children}
    </div>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-50 py-2 text-sm last:border-0">
      <span className="shrink-0 text-slate-500">{l}</span>
      <span className="text-right font-medium text-slate-900">{v}</span>
    </div>
  );
}

function MailBtn({ label, sent, onClick }: { label: string; sent?: string | null; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-sm transition hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {sent && <span className="text-[10px] text-slate-400">{fmtDate(sent)}</span>}
    </button>
  );
}

function ERow({ l, v, d, t = "text", save }: { l: string; v: string; d: string; t?: string; save: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(v);
  useEffect(() => { setDraft(v); }, [v]);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-4 border-b border-slate-50 py-2 text-sm last:border-0">
        <span className="shrink-0 text-slate-500">{l}</span>
        <button onClick={() => setEditing(true)} className="text-right text-xs font-medium text-brand-600 hover:underline">{d}</button>
      </div>
    );
  }

  return (
    <div className="border-b border-slate-50 py-2 last:border-0">
      <span className="text-xs font-medium text-slate-500">{l}</span>
      {t === "textarea" ? (
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500" />
      ) : (
        <input type={t} value={draft} onChange={(e) => setDraft(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500" />
      )}
      <div className="mt-1.5 flex gap-2">
        <button onClick={() => { save(draft); setEditing(false); }} className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white">OK</button>
        <button onClick={() => { setDraft(v); setEditing(false); }} className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-500">Abbrechen</button>
      </div>
    </div>
  );
}
