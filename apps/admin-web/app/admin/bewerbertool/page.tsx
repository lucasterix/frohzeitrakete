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
import { useCachedFetch } from "@/lib/use-cached-fetch";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  RefreshIcon,
  UsersIcon,
} from "@/components/icons";

const CALENDAR_URL = "https://calendar.app.google/nmXuFcbcPPLhxcHw8";

const STATUS_ORDER = [
  "eingegangen",
  "in_pruefung",
  "einladung",
  "gespraech",
  "probearbeit",
  "zusage",
  "fuehrungszeugnis",
  "vertrag",
  "eingestellt",
  "absage",
  "zurueckgezogen",
] as const;

const STATUS_LABELS: Record<string, string> = {
  eingegangen: "Eingegangen",
  in_pruefung: "In Prüfung",
  einladung: "Einladung",
  gespraech: "Gespräch",
  probearbeit: "Probearbeit",
  zusage: "Zusage",
  fuehrungszeugnis: "Führungszeugnis",
  vertrag: "Vertrag",
  eingestellt: "Eingestellt",
  absage: "Absage",
  zurueckgezogen: "Zurückgezogen",
};

const STATUS_COLORS: Record<string, string> = {
  eingegangen: "bg-blue-100 text-blue-700",
  in_pruefung: "bg-amber-100 text-amber-700",
  einladung: "bg-purple-100 text-purple-700",
  gespraech: "bg-indigo-100 text-indigo-700",
  probearbeit: "bg-cyan-100 text-cyan-700",
  zusage: "bg-emerald-100 text-emerald-700",
  fuehrungszeugnis: "bg-orange-100 text-orange-700",
  vertrag: "bg-teal-100 text-teal-700",
  eingestellt: "bg-green-100 text-green-800",
  absage: "bg-red-100 text-red-700",
  zurueckgezogen: "bg-slate-100 text-slate-500",
};

const SOURCE_LABELS: Record<string, string> = {
  indeed: "Indeed",
  stepstone: "StepStone",
  agentur: "Agentur für Arbeit",
  empfehlung: "Empfehlung",
  initiativ: "Initiativbewerbung",
  website: "Website",
  sonstige: "Sonstige",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type Tab = "pipeline" | "create" | "detail";

export default function BewerbertoolPage() {
  const { isLoading: authLoading, authorized } = useRequireOffice();
  const { user: me } = useAuth();

  const {
    data: applicants = [],
    mutate: mutateApplicants,
    isLoading: dataLoading,
  } = useCachedFetch<ApplicantRecord[]>(
    authorized ? "bewerbertool/list" : null,
    getApplicants
  );

  const [tab, setTab] = useState<Tab>("pipeline");
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [emailDialog, setEmailDialog] = useState<{
    applicant: ApplicantRecord;
    template: "confirmation" | "invitation" | "rejection" | "offer" | "trial_work" | "status_update";
  } | null>(null);
  const [emailNote, setEmailNote] = useState("");
  const [emailDate, setEmailDate] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailSending, setEmailSending] = useState(false);

  // Create form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPosition, setNewPosition] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newDesiredHours, setNewDesiredHours] = useState("");
  const [newDesiredLocation, setNewDesiredLocation] = useState("");
  const [newDesiredRole, setNewDesiredRole] = useState("");
  const [newAvailableFrom, setNewAvailableFrom] = useState("");
  const [newHasLicense, setNewHasLicense] = useState(false);
  const [newHasExperience, setNewHasExperience] = useState(false);
  const [newExperienceNote, setNewExperienceNote] = useState("");
  const [newSendConfirmation, setNewSendConfirmation] = useState(true);
  const [creating, setCreating] = useState(false);

  const selected = useMemo(
    () => applicants.find((a) => a.id === selectedId) ?? null,
    [applicants, selectedId]
  );

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

  const activeCount = useMemo(
    () => applicants.filter((a) => !["absage", "zurueckgezogen", "eingestellt"].includes(a.status)).length,
    [applicants]
  );

  async function handleCreate() {
    if (!newName.trim() || !newEmail.trim() || !newPosition.trim()) return;
    setCreating(true);
    setFlash("");
    setError("");
    try {
      await createApplicant({
        name: newName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim() || null,
        position: newPosition.trim(),
        source: newSource || null,
        note: newNote.trim() || null,
        desired_hours: newDesiredHours ? parseFloat(newDesiredHours) : null,
        desired_location: newDesiredLocation.trim() || null,
        desired_role: newDesiredRole.trim() || null,
        available_from: newAvailableFrom || null,
        has_drivers_license: newHasLicense || null,
        has_experience: newHasExperience || null,
        experience_note: newExperienceNote.trim() || null,
        send_confirmation: newSendConfirmation,
      });
      setFlash(newSendConfirmation ? "Bewerber angelegt & Eingangsbestätigung versendet." : "Bewerber angelegt.");
      setNewName(""); setNewEmail(""); setNewPhone(""); setNewPosition("");
      setNewSource(""); setNewNote(""); setNewDesiredHours(""); setNewDesiredLocation("");
      setNewDesiredRole(""); setNewAvailableFrom(""); setNewHasLicense(false);
      setNewHasExperience(false); setNewExperienceNote("");
      setTab("pipeline");
      await mutateApplicants();
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
      await mutateApplicants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusyId(null);
    }
  }

  async function handleFieldUpdate(id: number, field: string, value: unknown) {
    setBusyId(id);
    try {
      await updateApplicant(id, { [field]: value });
      await mutateApplicants();
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
      if (selectedId === id) { setSelectedId(null); setTab("pipeline"); }
      await mutateApplicants();
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
        trial_date: emailDate || undefined,
        note: emailNote || undefined,
        message: emailMessage || undefined,
      });
      setFlash(`E-Mail (${STATUS_LABELS[emailDialog.template] || emailDialog.template}) an ${emailDialog.applicant.email} gesendet.`);
      setEmailDialog(null);
      setEmailNote(""); setEmailDate(""); setEmailMessage("");
      await mutateApplicants();
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
      await mutateApplicants();
      setFlash("Bewerbungsunterlagen hochgeladen.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload-Fehler");
    } finally {
      setBusyId(null);
    }
  }

  function openDetail(a: ApplicantRecord) {
    setSelectedId(a.id);
    setTab("detail");
  }

  if (authLoading) {
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
            {activeCount} aktive Bewerbungen · {applicants.length} gesamt
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setTab("create"); setSelectedId(null); }}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            + Neuer Bewerber
          </button>
          <button
            onClick={() => mutateApplicants()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshIcon className={`h-4 w-4 ${dataLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {flash && (
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircleIcon className="h-4 w-4 shrink-0" />
          {flash}
          <button onClick={() => setFlash("")} className="ml-auto text-emerald-500">&times;</button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircleIcon className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError("")} className="ml-auto text-red-500">&times;</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl bg-slate-100 p-1">
        {(["pipeline", "create"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setSelectedId(null); }}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "pipeline" ? "Pipeline" : "Neuer Bewerber"}
          </button>
        ))}
        {tab === "detail" && selected && (
          <span className="flex items-center rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm">
            {selected.name}
            <button onClick={() => { setTab("pipeline"); setSelectedId(null); }} className="ml-2 text-slate-400 hover:text-slate-600">&times;</button>
          </span>
        )}
      </div>

      {/* Pipeline KPI */}
      {tab === "pipeline" && (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(filter === s ? "all" : s)}
                className={`rounded-2xl border p-2 text-center transition ${
                  filter === s
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-100 bg-white shadow-sm hover:border-slate-300"
                }`}
              >
                <div className="text-lg font-bold">{counts[s] ?? 0}</div>
                <div className="text-[10px] leading-tight">{STATUS_LABELS[s]}</div>
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Suchen (Name, E-Mail, Position)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
          />

          {dataLoading && applicants.length === 0 ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-brand-600" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
              {filter !== "all" ? `Keine Bewerber mit Status "${STATUS_LABELS[filter]}"` : "Keine Bewerber gefunden."}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((a) => (
                <button
                  key={a.id}
                  onClick={() => openDetail(a)}
                  className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition hover:shadow-md"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                    {a.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900">{a.name}</div>
                    <div className="mt-0.5 text-sm text-slate-500">
                      {a.position} · {a.email}{a.phone ? ` · ${a.phone}` : ""}
                    </div>
                  </div>
                  {a.desired_hours && (
                    <span className="hidden shrink-0 text-xs text-slate-400 sm:block">
                      {a.desired_hours}h/Wo
                    </span>
                  )}
                  <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[a.status] ?? "bg-slate-100"}`}>
                    {STATUS_LABELS[a.status] ?? a.status}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{fmtDate(a.created_at)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create Form */}
      {tab === "create" && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold">Bewerber erfassen</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Name *" value={newName} onChange={setNewName} />
            <Input label="E-Mail *" value={newEmail} onChange={setNewEmail} type="email" />
            <Input label="Telefon" value={newPhone} onChange={setNewPhone} type="tel" />
            <Input label="Position *" value={newPosition} onChange={setNewPosition} placeholder="z.B. Betreuungskraft" />
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Quelle</span>
              <select value={newSource} onChange={(e) => setNewSource(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500">
                <option value="">— nicht angegeben —</option>
                {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <Input label="Gewünschte Stunden/Woche" value={newDesiredHours} onChange={setNewDesiredHours} type="number" placeholder="z.B. 30" />
            <Input label="Gewünschter Standort" value={newDesiredLocation} onChange={setNewDesiredLocation} placeholder="z.B. Göttingen" />
            <Input label="Gewünschte Rolle" value={newDesiredRole} onChange={setNewDesiredRole} placeholder="z.B. Betreuungskraft" />
            <Input label="Verfügbar ab" value={newAvailableFrom} onChange={setNewAvailableFrom} type="date" />
            <div className="space-y-2 md:col-span-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={newHasLicense} onChange={(e) => setNewHasLicense(e.target.checked)} className="h-4 w-4" />
                Führerschein vorhanden
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={newHasExperience} onChange={(e) => setNewHasExperience(e.target.checked)} className="h-4 w-4" />
                Berufserfahrung in der Pflege/Betreuung
              </label>
            </div>
            {newHasExperience && (
              <Textarea label="Erfahrung (Details)" value={newExperienceNote} onChange={setNewExperienceNote} />
            )}
            <Textarea label="Notiz" value={newNote} onChange={setNewNote} />
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 md:col-span-2">
              <input type="checkbox" checked={newSendConfirmation} onChange={(e) => setNewSendConfirmation(e.target.checked)} className="h-4 w-4" />
              Eingangsbestätigung per E-Mail senden (mit Termin-Buchungslink)
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

      {/* Detail View */}
      {tab === "detail" && selected && (
        <div className="space-y-6">
          {/* Header card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{selected.name}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selected.email}{selected.phone ? ` · ${selected.phone}` : ""} · Beworben als {selected.position}
                </p>
              </div>
              <span className={`rounded-xl px-4 py-2 text-sm font-semibold ${STATUS_COLORS[selected.status] ?? "bg-slate-100"}`}>
                {STATUS_LABELS[selected.status] ?? selected.status}
              </span>
            </div>

            {/* Status change */}
            <div className="mt-5">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-slate-400">Status ändern</span>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(selected.id, s)}
                    disabled={busyId === selected.id || s === selected.status}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
                      s === selected.status
                        ? STATUS_COLORS[s]
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left: Details */}
            <div className="space-y-6">
              {/* Bewerberdaten */}
              <Section title="Bewerberdaten">
                <InfoRow label="Position" value={selected.position} />
                <InfoRow label="Quelle" value={SOURCE_LABELS[selected.source ?? ""] ?? selected.source ?? "—"} />
                <InfoRow label="Gewünschte Stunden" value={selected.desired_hours ? `${selected.desired_hours}h/Woche` : "—"} />
                <InfoRow label="Gewünschter Standort" value={selected.desired_location ?? "—"} />
                <InfoRow label="Gewünschte Rolle" value={selected.desired_role ?? "—"} />
                <InfoRow label="Verfügbar ab" value={selected.available_from ?? "—"} />
                <InfoRow label="Führerschein" value={selected.has_drivers_license === true ? "Ja" : selected.has_drivers_license === false ? "Nein" : "—"} />
                <InfoRow label="Berufserfahrung" value={selected.has_experience === true ? "Ja" : selected.has_experience === false ? "Nein" : "—"} />
                {selected.experience_note && <InfoRow label="Erfahrung" value={selected.experience_note} />}
                {selected.note && <InfoRow label="Notiz" value={selected.note} />}
              </Section>

              {/* Einstellungsdaten */}
              <Section title="Einstellung">
                <InfoRow label="Probearbeitstag" value={fmtDateTime(selected.trial_work_date)} />
                <InfoRow label="Führungszeugnis beantragt" value={fmtDate(selected.criminal_record_requested_at)} />
                <InfoRow label="Führungszeugnis eingegangen" value={fmtDate(selected.criminal_record_received_at)} />
                <InfoRow label="Eingestellt am" value={fmtDate(selected.hired_at)} />
                <InfoRow label="Eingestellt als" value={selected.hired_role ?? "—"} />
                <InfoRow label="Stunden (eingestellt)" value={selected.hired_hours ? `${selected.hired_hours}h/Woche` : "—"} />
                <InfoRow label="Standort (eingestellt)" value={selected.hired_location ?? "—"} />
                <InfoRow label="Vertrag versendet" value={fmtDate(selected.contract_sent_at)} />
                <InfoRow label="Startdatum" value={selected.start_date ?? "—"} />
              </Section>

              {/* Bewerbungsunterlagen */}
              <Section title="Bewerbungsunterlagen">
                {selected.resume_path ? (
                  <a
                    href={getApplicantResumeUrl(selected.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:underline"
                  >
                    Unterlagen herunterladen ↗
                  </a>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 transition hover:border-slate-400 hover:text-slate-700">
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleResumeUpload(selected.id, file);
                      }}
                    />
                    Datei hochladen (PDF, DOC)
                  </label>
                )}
              </Section>
            </div>

            {/* Right: Actions + Timeline */}
            <div className="space-y-6">
              {/* E-Mail-Aktionen */}
              <Section title="E-Mail senden">
                <div className="grid gap-2 sm:grid-cols-2">
                  <EmailButton label="Eingangsbestätigung" color="blue" onClick={() => setEmailDialog({ applicant: selected, template: "confirmation" })} sent={selected.confirmation_sent_at} />
                  <EmailButton label="Einladung zum Gespräch" color="purple" onClick={() => setEmailDialog({ applicant: selected, template: "invitation" })} sent={selected.invitation_sent_at} />
                  <EmailButton label="Probearbeit-Einladung" color="cyan" onClick={() => setEmailDialog({ applicant: selected, template: "trial_work" })} />
                  <EmailButton label="Zusage senden" color="emerald" onClick={() => setEmailDialog({ applicant: selected, template: "offer" })} sent={selected.offer_sent_at} />
                  <EmailButton label="Absage senden" color="red" onClick={() => setEmailDialog({ applicant: selected, template: "rejection" })} sent={selected.rejection_sent_at} />
                  <EmailButton label="Status-Update" color="slate" onClick={() => setEmailDialog({ applicant: selected, template: "status_update" })} />
                </div>
              </Section>

              {/* Quick-Edit Felder */}
              <Section title="Schnellbearbeitung">
                <div className="space-y-3">
                  <QuickEdit label="Notiz" value={selected.note ?? ""} onSave={(v) => handleFieldUpdate(selected.id, "note", v || null)} type="textarea" />
                  <QuickEdit label="Absagegrund" value={selected.rejection_reason ?? ""} onSave={(v) => handleFieldUpdate(selected.id, "rejection_reason", v || null)} type="textarea" />
                  <QuickEdit label="Führungszeugnis beantragt am" value={selected.criminal_record_requested_at?.slice(0, 10) ?? ""} onSave={(v) => handleFieldUpdate(selected.id, "criminal_record_requested_at", v ? new Date(v).toISOString() : null)} type="date" />
                  <QuickEdit label="Führungszeugnis eingegangen am" value={selected.criminal_record_received_at?.slice(0, 10) ?? ""} onSave={(v) => handleFieldUpdate(selected.id, "criminal_record_received_at", v ? new Date(v).toISOString() : null)} type="date" />
                  <QuickEdit label="Eingestellt: Stunden/Woche" value={selected.hired_hours?.toString() ?? ""} onSave={(v) => handleFieldUpdate(selected.id, "hired_hours", v ? parseFloat(v) : null)} type="number" />
                  <QuickEdit label="Eingestellt: Standort" value={selected.hired_location ?? ""} onSave={(v) => handleFieldUpdate(selected.id, "hired_location", v || null)} />
                  <QuickEdit label="Eingestellt: Rolle" value={selected.hired_role ?? ""} onSave={(v) => handleFieldUpdate(selected.id, "hired_role", v || null)} />
                  <QuickEdit label="Startdatum" value={selected.start_date ?? ""} onSave={(v) => handleFieldUpdate(selected.id, "start_date", v || null)} type="date" />
                </div>
              </Section>

              {/* Timeline */}
              <Section title="Verlauf">
                <div className="space-y-2 text-sm">
                  <TimelineItem date={selected.created_at} label="Bewerbung eingegangen" />
                  <TimelineItem date={selected.confirmation_sent_at} label="Eingangsbestätigung versendet" />
                  <TimelineItem date={selected.invitation_sent_at} label="Einladung versendet" />
                  {selected.interview_date && <TimelineItem date={selected.interview_date} label="Vorstellungsgespräch" />}
                  {selected.trial_work_date && <TimelineItem date={selected.trial_work_date} label="Probearbeitstag" />}
                  <TimelineItem date={selected.offer_sent_at} label="Zusage versendet" />
                  <TimelineItem date={selected.criminal_record_requested_at} label="Führungszeugnis beantragt" />
                  <TimelineItem date={selected.criminal_record_received_at} label="Führungszeugnis eingegangen" />
                  <TimelineItem date={selected.contract_sent_at} label="Vertrag versendet" />
                  <TimelineItem date={selected.hired_at} label="Eingestellt" />
                  <TimelineItem date={selected.rejection_sent_at} label="Absage versendet" />
                </div>
              </Section>

              {/* Delete */}
              <button
                onClick={() => handleDelete(selected.id)}
                disabled={busyId === selected.id}
                className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50"
              >
                Bewerber löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Dialog */}
      {emailDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {emailDialog.template === "confirmation" && "Eingangsbestätigung senden"}
              {emailDialog.template === "invitation" && "Einladung zum Gespräch"}
              {emailDialog.template === "rejection" && "Absage senden"}
              {emailDialog.template === "offer" && "Zusage senden"}
              {emailDialog.template === "trial_work" && "Probearbeit-Einladung"}
              {emailDialog.template === "status_update" && "Status-Update senden"}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              An: {emailDialog.applicant.name} ({emailDialog.applicant.email})
            </p>

            {(emailDialog.template === "invitation" || emailDialog.template === "trial_work") && (
              <label className="mt-4 block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  {emailDialog.template === "invitation" ? "Gesprächstermin" : "Probearbeitstag"} *
                </span>
                <input
                  type="datetime-local"
                  value={emailDate}
                  onChange={(e) => setEmailDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Der Bewerber erhält auch einen Link zum{" "}
                  <a href={CALENDAR_URL} target="_blank" rel="noreferrer" className="text-brand-600 underline">
                    Termin-Kalender
                  </a>{" "}
                  falls er umbuchen möchte.
                </p>
              </label>
            )}

            {emailDialog.template === "status_update" && (
              <label className="mt-4 block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Nachricht an Bewerber *</span>
                <textarea
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  rows={4}
                  placeholder="z.B. Wir prüfen derzeit Ihre Unterlagen und melden uns in Kürze..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
                />
              </label>
            )}

            {(emailDialog.template === "invitation" || emailDialog.template === "offer") && (
              <label className="mt-4 block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Zusätzliche Nachricht (optional)</span>
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
                  ((emailDialog.template === "invitation" || emailDialog.template === "trial_work") && !emailDate) ||
                  (emailDialog.template === "status_update" && !emailMessage.trim())
                }
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {emailSending ? "Sendet..." : "E-Mail senden"}
              </button>
              <button
                onClick={() => { setEmailDialog(null); setEmailNote(""); setEmailDate(""); setEmailMessage(""); }}
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

/* ── Helper Components ── */

function Input({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500" />
    </label>
  );
}

function Textarea({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <label className="block md:col-span-2">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3}
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500" />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-50 py-1.5 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

function EmailButton({ label, color, onClick, sent }: {
  label: string; color: string; onClick: () => void; sent?: string | null;
}) {
  return (
    <button onClick={onClick} className={`rounded-xl bg-${color}-50 px-3 py-2.5 text-left text-xs font-medium text-${color}-700 transition hover:bg-${color}-100`}>
      {label}
      {sent && <span className="mt-0.5 block text-[10px] font-normal opacity-60">Gesendet: {fmtDate(sent)}</span>}
    </button>
  );
}

function TimelineItem({ date, label }: { date: string | null; label: string }) {
  if (!date) return null;
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />
      <span className="text-slate-600">{label}</span>
      <span className="ml-auto text-xs text-slate-400">{fmtDate(date)}</span>
    </div>
  );
}

function QuickEdit({ label, value, onSave, type = "text" }: {
  label: string; value: string; onSave: (v: string) => void; type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  if (!editing) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">{label}</span>
        <button onClick={() => setEditing(true)} className="text-xs text-brand-600 hover:underline">
          {value ? "Bearbeiten" : "Eintragen"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {type === "textarea" ? (
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500" />
      ) : (
        <input type={type} value={draft} onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500" />
      )}
      <div className="flex gap-2">
        <button onClick={() => { onSave(draft); setEditing(false); }}
          className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white">Speichern</button>
        <button onClick={() => { setDraft(value); setEditing(false); }}
          className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600">Abbrechen</button>
      </div>
    </div>
  );
}
