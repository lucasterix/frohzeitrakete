"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminAnnouncement,
  HrRequestRecord,
  SickLeave,
  VacationRequest,
  acknowledgeSickLeave,
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncements,
  getHrRequests,
  getSickLeaves,
  getVacationRequests,
  resolveHrRequest,
  resolveVacationRequest,
} from "@/lib/api";
import { useRequireOffice } from "@/lib/use-require-role";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  RefreshIcon,
  SparkleIcon,
} from "@/components/icons";

type Tab = "vacation" | "sick" | "hr" | "announcements";

const CATEGORY_LABELS: Record<string, string> = {
  overtime_payout: "Überstundenauszahlung",
  income_certificate: "Verdienstbescheinigung",
  salary_advance: "Gehaltsvorschuss",
  address_change: "Neue Adresse",
  side_job_certificate: "Nebenverdienstbescheinigung",
  other: "Sonstiges",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
    }).format(new Date(iso));
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

export default function OfficeInboxPage() {
  const { user: me, isLoading: authLoading, authorized } = useRequireOffice();
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState<Tab>("vacation");

  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [sickLeaves, setSickLeaves] = useState<SickLeave[]>([]);
  const [hrRequests, setHrRequests] = useState<HrRequestRecord[]>([]);
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);

  const [kuerzel, setKuerzel] = useState("");
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadAll = useCallback(async () => {
    setError("");
    try {
      const [v, s, h, a] = await Promise.all([
        getVacationRequests(),
        getSickLeaves(),
        getHrRequests(),
        getAnnouncements(),
      ]);
      setVacations(v);
      setSickLeaves(s);
      setHrRequests(h);
      setAnnouncements(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    }
  }, []);

  useEffect(() => {
    if (me) setKuerzel(me.full_name.split(" ")[0] ?? "");
  }, [me]);

  useEffect(() => {
    if (!authorized) return;
    loadAll().finally(() => setBooting(false));
  }, [authorized, loadAll]);

  async function handleVacationResolve(
    row: VacationRequest,
    status: "approved" | "partially_approved" | "rejected"
  ) {
    let response_text: string | null = null;
    let approved_from_date: string | null = null;
    let approved_to_date: string | null = null;
    if (status === "partially_approved") {
      const f = window.prompt(
        `Genehmigter Zeitraum FROM (YYYY-MM-DD), Original ${row.from_date}:`,
        row.from_date
      );
      if (!f) return;
      const t = window.prompt(
        `Genehmigter Zeitraum TO (YYYY-MM-DD), Original ${row.to_date}:`,
        row.to_date
      );
      if (!t) return;
      approved_from_date = f;
      approved_to_date = t;
    }
    if (status === "rejected") {
      const r = window.prompt("Begründung für die Ablehnung:", "");
      if (r === null) return;
      response_text = r;
    } else {
      const r = window.prompt(
        "Rückmeldung ans Team (optional):",
        status === "approved" ? "Viel Spaß im Urlaub!" : ""
      );
      if (r !== null) response_text = r;
    }
    if (!kuerzel) {
      setError("Bitte Bearbeitungskürzel eintragen");
      return;
    }
    setBusyId(row.id);
    setError("");
    try {
      await resolveVacationRequest(row.id, {
        status,
        approved_from_date,
        approved_to_date,
        response_text,
        handler_kuerzel: kuerzel,
      });
      setFlash(`Urlaubsantrag ${row.id} bearbeitet.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSickAck(row: SickLeave) {
    const r = window.prompt(
      "Rückmeldung (optional, z.B. 'Gute Besserung'):",
      "Gute Besserung!"
    );
    if (r === null) return;
    if (!kuerzel) {
      setError("Bitte Bearbeitungskürzel eintragen");
      return;
    }
    setBusyId(row.id);
    setError("");
    try {
      await acknowledgeSickLeave(row.id, {
        response_text: r,
        handler_kuerzel: kuerzel,
      });
      setFlash(`Krankmeldung ${row.id} als gesichtet markiert.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusyId(null);
    }
  }

  async function handleHrResolve(
    row: HrRequestRecord,
    status: "done" | "rejected"
  ) {
    const r = window.prompt(
      "Rückmeldung ans Team:",
      status === "done" ? "Ist erledigt." : ""
    );
    if (r === null) return;
    if (!kuerzel) {
      setError("Bitte Bearbeitungskürzel eintragen");
      return;
    }
    setBusyId(row.id);
    setError("");
    try {
      await resolveHrRequest(row.id, {
        status,
        response_text: r,
        handler_kuerzel: kuerzel,
      });
      setFlash(`HR-Anfrage ${row.id} bearbeitet.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusyId(null);
    }
  }

  async function handleNewAnnouncement() {
    const title = window.prompt("Titel:");
    if (!title) return;
    const body = window.prompt("Inhalt:");
    if (!body) return;
    const until = window.prompt(
      "Sichtbar bis (YYYY-MM-DD):",
      new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    );
    if (!until) return;
    setError("");
    try {
      await createAnnouncement({
        title,
        body,
        visible_until: new Date(`${until}T23:59:59`).toISOString(),
      });
      setFlash("Ankündigung veröffentlicht.");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function handleDeleteAnnouncement(id: number) {
    if (!window.confirm("Ankündigung wirklich löschen?")) return;
    try {
      await deleteAnnouncement(id);
      setFlash("Ankündigung gelöscht.");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  }

  if (booting) {
    return <div className="h-64 animate-pulse rounded-3xl bg-white/60" />;
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
              Office Inbox
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Urlaub, Krank, HR-Anfragen und Ankündigungen
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              Bearbeitet von:
              <input
                value={kuerzel}
                onChange={(e) => setKuerzel(e.target.value)}
                className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
                maxLength={50}
                placeholder="Daniel"
              />
            </label>
            <button
              onClick={loadAll}
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

      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "vacation", label: "Urlaub", count: vacations.filter((v) => v.status === "open").length },
            { key: "sick", label: "Krank", count: sickLeaves.filter((s) => !s.acknowledged_at).length },
            { key: "hr", label: "HR-Anfragen", count: hrRequests.filter((h) => h.status === "open").length },
            { key: "announcements", label: "Ankündigungen", count: announcements.length },
          ] as { key: Tab; label: string; count: number }[]
        ).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === key
                ? "bg-slate-900 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            }`}
          >
            {label}
            <span
              className={`rounded-full px-1.5 text-xs font-semibold tabular-nums ${
                tab === key ? "bg-white/20" : "bg-slate-100 text-slate-500"
              }`}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {tab === "vacation" && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {vacations.length === 0 ? (
            <EmptyRow>Keine Urlaubsanträge</EmptyRow>
          ) : (
            <ul className="space-y-3">
              {vacations.map((row) => {
                const green = row.status !== "open";
                return (
                  <li
                    key={row.id}
                    className={`rounded-2xl border p-4 ${
                      green
                        ? "border-emerald-200 bg-emerald-50/50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        User #{row.user_id}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${StatusColor(row.status)}`}
                      >
                        {StatusLabel(row.status)}
                      </span>
                      <span className="text-xs text-slate-400">
                        eingereicht {formatDateTime(row.created_at)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm">
                      {formatDate(row.from_date)} – {formatDate(row.to_date)}
                      {row.note ? ` · ${row.note}` : ""}
                    </div>
                    {row.approved_from_date && row.approved_to_date && (
                      <div className="mt-1 text-xs text-slate-600">
                        Genehmigt: {formatDate(row.approved_from_date)} –{" "}
                        {formatDate(row.approved_to_date)}
                      </div>
                    )}
                    {row.response_text && (
                      <div className="mt-1 text-xs text-slate-600">
                        Antwort: {row.response_text}
                      </div>
                    )}
                    {row.handler_kuerzel && (
                      <div className="mt-1 text-[11px] italic text-slate-500">
                        Bearbeitet von {row.handler_kuerzel} am{" "}
                        {formatDateTime(row.handled_at)}
                      </div>
                    )}
                    {row.status === "open" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ActionButton
                          disabled={busyId === row.id}
                          onClick={() =>
                            handleVacationResolve(row, "approved")
                          }
                        >
                          Genehmigen
                        </ActionButton>
                        <ActionButton
                          disabled={busyId === row.id}
                          variant="amber"
                          onClick={() =>
                            handleVacationResolve(row, "partially_approved")
                          }
                        >
                          Teilgenehmigen
                        </ActionButton>
                        <ActionButton
                          disabled={busyId === row.id}
                          variant="red"
                          onClick={() =>
                            handleVacationResolve(row, "rejected")
                          }
                        >
                          Ablehnen
                        </ActionButton>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === "sick" && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {sickLeaves.length === 0 ? (
            <EmptyRow>Keine Krankmeldungen</EmptyRow>
          ) : (
            <ul className="space-y-3">
              {sickLeaves.map((row) => {
                const done = row.acknowledged_at !== null;
                return (
                  <li
                    key={row.id}
                    className={`rounded-2xl border p-4 ${
                      done
                        ? "border-emerald-200 bg-emerald-50/50"
                        : "border-orange-200 bg-orange-50/30"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">
                        User #{row.user_id}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          done
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-orange-100 text-orange-800"
                        }`}
                      >
                        {done ? "Gesichtet" : "Offen"}
                      </span>
                      <span className="text-xs text-slate-400">
                        gemeldet {formatDateTime(row.created_at)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm">
                      {formatDate(row.from_date)} – {formatDate(row.to_date)}
                      {row.note ? ` · ${row.note}` : ""}
                    </div>
                    {row.response_text && (
                      <div className="mt-1 text-xs text-slate-600">
                        Antwort: {row.response_text}
                      </div>
                    )}
                    {row.handler_kuerzel && (
                      <div className="mt-1 text-[11px] italic text-slate-500">
                        Bearbeitet von {row.handler_kuerzel} am{" "}
                        {formatDateTime(row.acknowledged_at)}
                      </div>
                    )}
                    {!done && (
                      <div className="mt-3">
                        <ActionButton
                          disabled={busyId === row.id}
                          onClick={() => handleSickAck(row)}
                        >
                          Als gesichtet markieren
                        </ActionButton>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === "hr" && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {hrRequests.length === 0 ? (
            <EmptyRow>Keine HR-Anfragen</EmptyRow>
          ) : (
            <ul className="space-y-3">
              {hrRequests.map((row) => {
                const done = row.status !== "open";
                return (
                  <li
                    key={row.id}
                    className={`rounded-2xl border p-4 ${
                      done
                        ? "border-emerald-200 bg-emerald-50/50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        {CATEGORY_LABELS[row.category] ?? row.category}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${StatusColor(row.status)}`}
                      >
                        {StatusLabel(row.status)}
                      </span>
                      <span className="text-xs text-slate-400">
                        User #{row.user_id} · {formatDateTime(row.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-base font-semibold text-slate-900">
                      {row.subject}
                    </p>
                    {row.body && (
                      <p className="mt-1 text-sm text-slate-700">{row.body}</p>
                    )}
                    {row.response_text && (
                      <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        Antwort: {row.response_text}
                      </div>
                    )}
                    {row.handler_kuerzel && (
                      <div className="mt-1 text-[11px] italic text-slate-500">
                        Bearbeitet von {row.handler_kuerzel} am{" "}
                        {formatDateTime(row.handled_at)}
                      </div>
                    )}
                    {row.status === "open" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ActionButton
                          disabled={busyId === row.id}
                          onClick={() => handleHrResolve(row, "done")}
                        >
                          Erledigt
                        </ActionButton>
                        <ActionButton
                          disabled={busyId === row.id}
                          variant="red"
                          onClick={() => handleHrResolve(row, "rejected")}
                        >
                          Ablehnen
                        </ActionButton>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === "announcements" && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <button
              onClick={handleNewAnnouncement}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white"
            >
              <SparkleIcon className="h-4 w-4" />
              Neue Ankündigung
            </button>
          </div>
          {announcements.length === 0 ? (
            <EmptyRow>Keine Ankündigungen</EmptyRow>
          ) : (
            <ul className="space-y-3">
              {announcements.map((row) => (
                <li
                  key={row.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-base font-semibold text-slate-900">
                      {row.title}
                    </span>
                    <button
                      onClick={() => handleDeleteAnnouncement(row.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Löschen
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{row.body}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Sichtbar {formatDateTime(row.visible_from)} bis{" "}
                    {formatDateTime(row.visible_until)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function StatusLabel(status: string): string {
  switch (status) {
    case "approved":
      return "Genehmigt";
    case "partially_approved":
      return "Teilweise";
    case "rejected":
      return "Abgelehnt";
    case "done":
      return "Erledigt";
    default:
      return "Offen";
  }
}

function StatusColor(status: string): string {
  switch (status) {
    case "approved":
    case "done":
      return "bg-emerald-100 text-emerald-800";
    case "partially_approved":
      return "bg-amber-100 text-amber-800";
    case "rejected":
      return "bg-red-100 text-red-800";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = "green",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "green" | "red" | "amber";
}) {
  const cls =
    variant === "red"
      ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
      : variant === "amber"
        ? "border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
        : "bg-brand-600 text-white hover:bg-brand-700";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium transition disabled:opacity-60 ${cls}`}
    >
      {children}
    </button>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
      {children}
    </div>
  );
}
