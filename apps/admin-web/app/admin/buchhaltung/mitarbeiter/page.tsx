"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const DATEV_API_BASE_URL =
  process.env.NEXT_PUBLIC_DATEV_API_BASE_URL ||
  "https://buchhaltung-api.froehlichdienste.de";

// --- API client wrapper ----------------------------------------------------

class AuthExpiredError extends Error {
  constructor() {
    super("Session abgelaufen");
    this.name = "AuthExpiredError";
  }
}

async function api<T>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const { json, ...rest } = init ?? {};
  const response = await fetch(`${DATEV_API_BASE_URL}${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (response.status === 401) {
    throw new AuthExpiredError();
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  return response.json() as Promise<T>;
}

// --- types -----------------------------------------------------------------

type SyncHealth = {
  bridge_reachable: boolean;
  queue: { pending: number; in_progress: number; done: number; error: number };
};

type Employee = {
  id: number;
  personnel_number: number;
  company_personnel_number: string | null;
  first_name: string | null;
  surname: string | null;
  full_name: string;
  date_of_birth: string | null;
  date_of_joining: string | null;
  date_of_leaving: string | null;
  job_title: string | null;
  weekly_working_hours: number | null;
  type_of_contract: string | null;
  is_active: boolean;
  has_pending_changes: boolean;
  last_synced_at: string | null;
  last_sync_status: string | null;
  patti_link_state: "unmatched" | "auto" | "manual";
  patti_person_id: number | null;
  pending_op_count: number;
};

type PendingOp = {
  id: number;
  op: string;
  payload: unknown;
  status: "pending" | "in_progress" | "done" | "error";
  attempts: number;
  last_error: string | null;
  created_at: string;
  last_attempt_at: string | null;
};

type Profile = {
  personnel_number: number;
  full_name: string;
  is_active: boolean;
  date_of_birth: string | null;
  date_of_joining: string | null;
  date_of_leaving: string | null;
  contact: {
    first_name?: string | null;
    surname?: string | null;
    street?: string | null;
    house_number?: string | null;
    postal_code?: string | null;
    city?: string | null;
    country?: string | null;
    address_affix?: string | null;
  };
  bank: {
    iban?: string | null;
    bic?: string | null;
    differing_account_holder?: string | null;
  };
  bezuege: {
    gross_payments?: Array<{
      id?: string | number;
      salary_type_id?: number;
      amount?: number;
      reference_date?: string;
      payment_interval?: string;
    }>;
    hourly_wages?: Array<{
      id?: string | number;
      amount?: number;
    }>;
  };
  patti: {
    linked: boolean;
    person_id?: number;
    first_name?: string | null;
    last_name?: string | null;
    born_at?: string | null;
    address?: { id?: number; address_line?: string; city?: string; zip_code?: string };
    communication?: {
      id?: number;
      mobile_number?: string | null;
      phone_number?: string | null;
      email?: string | null;
    };
    iban?: string | null;
    bic?: string | null;
    updated_at?: string | null;
  };
  last_datev_synced_at: string | null;
  last_patti_synced_at: string | null;
  pending_operations: PendingOp[];
};

// --- formatting helpers ----------------------------------------------------

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("de-DE");
}

function formatDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  "1": "Unbefristet Vollzeit",
  "2": "Unbefristet Teilzeit",
  "3": "Befristet Vollzeit",
  "4": "Befristet Teilzeit",
};

// --- main page -------------------------------------------------------------

type SyncResult = {
  datev?: { ok?: boolean; created?: number; updated?: number; listed?: number; error?: string };
  auto_link?: { linked?: number; still_unmatched?: number };
  patti?: { refreshed?: number; failed?: number };
};

type DrainResult = { done: number; retry: number; error: number; total: number };

export default function MitarbeiterPage() {
  const [health, setHealth] = useState<SyncHealth | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busyAction, setBusyAction] = useState<null | "sync" | "drain">(null);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [pattiFilter, setPattiFilter] = useState<"alle" | "verknuepft" | "unverknuepft">("alle");
  const [authExpired, setAuthExpired] = useState(false);

  const handleApiError = useCallback((e: unknown) => {
    if (e instanceof AuthExpiredError) {
      setAuthExpired(true);
      return;
    }
    setError(e instanceof Error ? e.message : "Fehler beim Laden");
  }, []);

  const loadAll = useCallback(async () => {
    setError("");
    try {
      const [h, e] = await Promise.all([
        api<SyncHealth>("/datev/sync/health"),
        api<Employee[]>(
          `/datev/employees${includeInactive ? "?include_inactive=true" : ""}`
        ),
      ]);
      setHealth(h);
      setEmployees(e);
      setAuthExpired(false);
    } catch (e) {
      handleApiError(e);
    }
  }, [includeInactive, handleApiError]);

  useEffect(() => {
    loadAll();
    // Soft-poll every 30s so co-workers' edits show up — but only
    // when the tab is actually visible. Hidden tabs don't make
    // any background calls (idle apps shouldn't pull traffic).
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      Promise.all([
        api<SyncHealth>("/datev/sync/health"),
        api<Employee[]>(
          `/datev/employees${includeInactive ? "?include_inactive=true" : ""}`
        ),
      ])
        .then(([h, e]) => {
          setHealth(h);
          setEmployees(e);
        })
        .catch(() => {});
    }, 30000);
    // When the tab becomes visible again, refresh once immediately
    // so the user doesn't see stale data after switching back.
    const onVisible = () => {
      if (document.visibilityState === "visible") loadAll();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      clearInterval(t);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, [loadAll]);

  const fullSync = async () => {
    setBusyAction("sync");
    setError("");
    setInfo("");
    try {
      const r = await api<SyncResult>(`/datev/sync/full`, { method: "POST" });
      await loadAll();
      const parts: string[] = [];
      if (r.datev) {
        if (r.datev.ok) {
          parts.push(
            `DATEV: ${r.datev.listed ?? 0} Mitarbeiter (${r.datev.created ?? 0} neu, ${
              r.datev.updated ?? 0
            } aktualisiert)`
          );
        } else {
          parts.push(`DATEV-Fehler: ${r.datev.error ?? "siehe Server-Log"}`);
        }
      }
      if (r.auto_link) {
        parts.push(
          `Patti-Auto-Link: ${r.auto_link.linked ?? 0} verknüpft, ${
            r.auto_link.still_unmatched ?? 0
          } unverknüpft`
        );
      }
      if (r.patti) {
        parts.push(`Patti-Refresh: ${r.patti.refreshed ?? 0} aktualisiert`);
      }
      setInfo(parts.join(" · "));
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusyAction(null);
    }
  };

  const drainQueue = async () => {
    setBusyAction("drain");
    setError("");
    setInfo("");
    try {
      const r = await api<DrainResult>(`/datev/sync/drain-queue`, { method: "POST" });
      await loadAll();
      setInfo(
        `${r.done} fertig, ${r.retry} später wiederholen, ${r.error} Fehler — von ${r.total} insgesamt`
      );
      if (r.error > 0) {
        setError(`${r.error} Operation(en) sind dauerhaft fehlgeschlagen — siehe Profile.`);
      }
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusyAction(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (q) {
        const hit =
          e.full_name.toLowerCase().includes(q) ||
          (e.job_title?.toLowerCase().includes(q) ?? false) ||
          String(e.personnel_number).includes(q);
        if (!hit) return false;
      }
      if (pattiFilter === "verknuepft" && e.patti_link_state === "unmatched") return false;
      if (pattiFilter === "unverknuepft" && e.patti_link_state !== "unmatched") return false;
      return true;
    });
  }, [employees, search, pattiFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Mitarbeiter & Lohn</h2>
        <p className="mt-1 text-sm text-slate-600">
          Stammdaten aus DATEV Lohn und Gehalt sowie Patti — Änderungen
          werden in eine Queue gestellt und automatisch im Hintergrund auf
          beide Systeme angewendet.
        </p>
      </div>

      <SyncStatusBar
        health={health}
        onFullSync={fullSync}
        onDrain={drainQueue}
        busyAction={busyAction}
      />

      {authExpired ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Sitzung abgelaufen.</strong> Bitte einmal die Seite neu laden, dann
          wirst Du automatisch zum Login geleitet, falls nötig.
          <button
            onClick={() => window.location.reload()}
            className="ml-3 rounded-lg bg-amber-700 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-800"
          >
            Seite neu laden
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Suche: Name, Personalnummer, Tätigkeit …"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <select
          value={pattiFilter}
          onChange={(e) => setPattiFilter(e.target.value as typeof pattiFilter)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="alle">Alle Patti-Stati</option>
          <option value="verknuepft">Mit Patti verknüpft</option>
          <option value="unverknuepft">Ohne Patti-Verknüpfung</option>
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Auch ausgeschiedene anzeigen
        </label>
        <span className="ml-auto text-xs text-slate-500">
          {filtered.length} von {employees.length}
        </span>
      </div>

      {info ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {info}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Noch keine Mitarbeiter geladen. „Aus DATEV/Patti synchronisieren" klicken.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">PersNr</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Eintritt</th>
                <th className="px-4 py-3 text-left">Austritt</th>
                <th className="px-4 py-3 text-left">Patti</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Aufträge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => setSelected(e.personnel_number)}
                  className="cursor-pointer transition hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {e.personnel_number}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{e.full_name}</td>
                  <td className="px-4 py-3 text-slate-700">{formatDate(e.date_of_joining)}</td>
                  <td className="px-4 py-3 text-slate-700">{formatDate(e.date_of_leaving)}</td>
                  <td className="px-4 py-3">
                    {e.patti_link_state !== "unmatched" ? (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        verknüpft
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {e.is_active ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        aktiv
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                        ausgeschieden
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {e.pending_op_count > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        {e.pending_op_count}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected !== null ? (
        <ProfileDrawer
          personnelNumber={selected}
          onClose={() => setSelected(null)}
          onChanged={loadAll}
        />
      ) : null}
    </div>
  );
}

// --- sync status bar ------------------------------------------------------

function Spinner() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden
    />
  );
}

function SyncStatusBar({
  health,
  onFullSync,
  onDrain,
  busyAction,
}: {
  health: SyncHealth | null;
  onFullSync: () => void;
  onDrain: () => void;
  busyAction: null | "sync" | "drain";
}) {
  const bridgeOk = health?.bridge_reachable;
  const queue = health?.queue ?? { pending: 0, in_progress: 0, done: 0, error: 0 };
  const anyBusy = busyAction !== null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-3 w-3 rounded-full ${
                bridgeOk === undefined
                  ? "bg-slate-300"
                  : bridgeOk
                  ? "bg-emerald-500"
                  : "bg-red-500"
              }`}
              aria-label={bridgeOk ? "Bridge erreichbar" : "Bridge nicht erreichbar"}
            />
            <span className="text-sm font-medium text-slate-800">
              DATEV-Bridge {bridgeOk === undefined ? "…" : bridgeOk ? "erreichbar" : "OFFLINE"}
            </span>
          </div>
          <div className="text-sm text-slate-700">
            <span className="font-medium">Queue:</span>{" "}
            {queue.pending > 0 ? (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                {queue.pending} pending
              </span>
            ) : (
              <span className="text-slate-500">leer</span>
            )}
            {queue.error > 0 ? (
              <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">
                {queue.error} Fehler
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onDrain}
            disabled={anyBusy}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
          >
            {busyAction === "drain" ? (
              <>
                <Spinner /> Verarbeite Queue …
              </>
            ) : (
              "Queue jetzt abarbeiten"
            )}
          </button>
          <button
            onClick={onFullSync}
            disabled={anyBusy || !bridgeOk}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-800 disabled:opacity-50"
          >
            {busyAction === "sync" ? (
              <>
                <Spinner /> Synchronisiere — kann ~30s dauern …
              </>
            ) : (
              "Aus DATEV/Patti synchronisieren"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- profile drawer -------------------------------------------------------

type Tab = "kontakt" | "bank" | "bezuege" | "patti" | "queue";

function ProfileDrawer({
  personnelNumber,
  onClose,
  onChanged,
}: {
  personnelNumber: number;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>("kontakt");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const p = await api<Profile>(`/datev/employees/${personnelNumber}/profile`);
      setProfile(p);
    } catch (e) {
      if (e instanceof AuthExpiredError) {
        setError("Sitzung abgelaufen — bitte Seite neu laden.");
      } else {
        setError(e instanceof Error ? e.message : "Fehler beim Laden");
      }
    }
  }, [personnelNumber]);

  // Poll the open profile only when there's something worth watching:
  // pending/in-progress operations need fast updates, an idle profile
  // doesn't need any background traffic.
  const hasActiveOps = !!profile?.pending_operations.some(
    (o) => o.status === "pending" || o.status === "in_progress"
  );
  const profilePollMs = hasActiveOps ? 8000 : 60000;

  useEffect(() => {
    reload();
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      api<Profile>(`/datev/employees/${personnelNumber}/profile`)
        .then(setProfile)
        .catch(() => {});
    }, profilePollMs);
    return () => clearInterval(t);
  }, [reload, personnelNumber, profilePollMs]);

  if (!profile) {
    return (
      <Drawer onClose={onClose} title="Lade …" subtitle="">
        {error ? <p className="px-6 py-5 text-sm text-red-700">{error}</p> : null}
      </Drawer>
    );
  }

  const queueCount = profile.pending_operations.filter(
    (o) => o.status === "pending" || o.status === "in_progress"
  ).length;
  const errorCount = profile.pending_operations.filter((o) => o.status === "error").length;

  return (
    <Drawer
      onClose={onClose}
      title={profile.full_name}
      subtitle={`PersNr ${profile.personnel_number}${
        profile.is_active ? "" : " · ausgeschieden"
      }`}
    >
      <nav className="flex border-b border-slate-200">
        {(
          [
            ["kontakt", "Kontakt"],
            ["bank", "Bank"],
            ["bezuege", "Bezüge"],
            ["patti", profile.patti.linked ? "Patti ✓" : "Patti"],
            ["queue", `Aufträge${queueCount + errorCount > 0 ? ` (${queueCount + errorCount})` : ""}`],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 px-4 py-3 text-sm font-medium transition ${
              tab === id
                ? "border-b-2 border-slate-900 text-slate-900"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {error ? (
        <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      ) : null}

      {tab === "kontakt" ? (
        <ContactTab profile={profile} onSaved={async () => { await reload(); await onChanged(); }} setError={setError} />
      ) : null}
      {tab === "bank" ? (
        <BankTab profile={profile} onSaved={async () => { await reload(); await onChanged(); }} setError={setError} />
      ) : null}
      {tab === "bezuege" ? (
        <BezuegeTab profile={profile} onSaved={async () => { await reload(); await onChanged(); }} setError={setError} />
      ) : null}
      {tab === "patti" ? (
        <PattiTab profile={profile} onChanged={async () => { await reload(); await onChanged(); }} setError={setError} />
      ) : null}
      {tab === "queue" ? <QueueTab profile={profile} /> : null}
    </Drawer>
  );
}

function Drawer({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-label="Schließen" />
      <aside className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="text-xs text-slate-500">{subtitle}</div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            ✕
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

// --- tabs -----------------------------------------------------------------

function ContactTab({
  profile,
  onSaved,
  setError,
}: {
  profile: Profile;
  onSaved: () => Promise<void> | void;
  setError: (s: string) => void;
}) {
  const c = profile.contact;
  const comm = profile.patti.communication;
  const [street, setStreet] = useState(c.street ?? "");
  const [houseNr, setHouseNr] = useState(c.house_number ?? "");
  const [zip, setZip] = useState(c.postal_code ?? "");
  const [city, setCity] = useState(c.city ?? "");
  const [mobile, setMobile] = useState(comm?.mobile_number ?? "");
  const [phone, setPhone] = useState(comm?.phone_number ?? "");
  const [email, setEmail] = useState(comm?.email ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const delta: Record<string, unknown> = {};
      if (street !== (c.street ?? "")) delta.street = street;
      if (houseNr !== (c.house_number ?? "")) delta.house_number = houseNr;
      if (zip !== (c.postal_code ?? "")) delta.postal_code = zip;
      if (city !== (c.city ?? "")) delta.city = city;
      if (mobile !== (comm?.mobile_number ?? "")) delta.mobile_number = mobile;
      if (phone !== (comm?.phone_number ?? "")) delta.phone_number = phone;
      if (email !== (comm?.email ?? "")) delta.email = email;
      if (Object.keys(delta).length === 0) return;
      await api(`/datev/employees/${profile.personnel_number}/contact`, {
        method: "PATCH",
        json: delta,
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 px-6 py-5">
      <Section title="Adresse (DATEV)">
        <Field label="Straße">
          <input value={street} onChange={(e) => setStreet(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Hausnummer">
          <input value={houseNr} onChange={(e) => setHouseNr(e.target.value)} className={inputCls} />
        </Field>
        <Field label="PLZ">
          <input value={zip} onChange={(e) => setZip(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Ort">
          <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} />
        </Field>
      </Section>

      <Section title={profile.patti.linked ? "Telefon / E-Mail (Patti)" : "Telefon / E-Mail"}>
        {!profile.patti.linked ? (
          <p className="text-xs text-amber-700">
            Nicht mit Patti verknüpft — Telefon und E-Mail können erst nach Verknüpfung
            gepflegt werden (Tab „Patti").
          </p>
        ) : (
          <>
            <Field label="Mobil">
              <input value={mobile} onChange={(e) => setMobile(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Telefon">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
            </Field>
            <Field label="E-Mail">
              <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} type="email" />
            </Field>
          </>
        )}
      </Section>

      <SaveBar onSave={save} disabled={saving} />
    </div>
  );
}

function BankTab({
  profile,
  onSaved,
  setError,
}: {
  profile: Profile;
  onSaved: () => Promise<void> | void;
  setError: (s: string) => void;
}) {
  const b = profile.bank;
  const [iban, setIban] = useState(b.iban ?? "");
  const [bic, setBic] = useState(b.bic ?? "");
  const [holder, setHolder] = useState(b.differing_account_holder ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const delta: Record<string, unknown> = {};
      if (iban !== (b.iban ?? "")) delta.iban = iban;
      if (bic !== (b.bic ?? "")) delta.bic = bic;
      if (holder !== (b.differing_account_holder ?? "")) delta.differing_account_holder = holder;
      if (Object.keys(delta).length === 0) return;
      await api(`/datev/employees/${profile.personnel_number}/bank`, {
        method: "PATCH",
        json: delta,
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 px-6 py-5">
      <Section title="Bankverbindung (DATEV)">
        <Field label="IBAN">
          <input value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} className={`${inputCls} font-mono`} />
        </Field>
        <Field label="BIC">
          <input value={bic} onChange={(e) => setBic(e.target.value.toUpperCase())} className={`${inputCls} font-mono`} />
        </Field>
        <Field label="Abweichender Kontoinhaber">
          <input value={holder} onChange={(e) => setHolder(e.target.value)} className={inputCls} />
        </Field>
      </Section>

      <SaveBar onSave={save} disabled={saving} />
    </div>
  );
}

// Common DATEV salary types Daniel actually uses, with German labels.
// Numeric range is wide (DATEV-LuG knows thousands) — list is suggestions
// for the dropdown; Daniel can always type a custom number.
const COMMON_SALARY_TYPES: Array<{ id: number; label: string }> = [
  { id: 2000, label: "Gehalt" },
  { id: 2002, label: "Geschäftsführergehalt" },
  { id: 2030, label: "Leistungszulage" },
  { id: 2350, label: "Firmenrad, stpfl." },
  { id: 2370, label: "Firmenrad Gehaltsumwandlung" },
  { id: 2410, label: "Privatfahrten (Firmenwagen)" },
  { id: 2420, label: "Fahrten Wohnung/Arbeit" },
  { id: 2480, label: "Sachbezug, st/sv-frei" },
  { id: 2507, label: "Sonstiger Sachbezug" },
  { id: 4310, label: "Abfindung o.Freib." },
  { id: 8190, label: "Sonstiger Lohn" },
];

function describeSalaryType(id: number | undefined): string {
  if (id === undefined || id === null) return "—";
  const known = COMMON_SALARY_TYPES.find((s) => s.id === id);
  return known ? `${id} – ${known.label}` : String(id);
}

function describeInterval(i: string | undefined): string {
  return {
    monthly: "monatlich",
    quarterly: "quartalsweise",
    semiannually: "halbjährlich",
    annually: "jährlich",
  }[i ?? "monthly"] ?? (i ?? "monatlich");
}

function BezuegeTab({
  profile,
  onSaved,
  setError,
}: {
  profile: Profile;
  onSaved: () => Promise<void> | void;
  setError: (s: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | number | null | "new">(null);

  const grossPayments = profile.bezuege.gross_payments ?? [];

  return (
    <div className="space-y-6 px-6 py-5">
      <Section title="Festbezüge (Monatsgehalt, Zulagen, Sachbezüge)">
        {grossPayments.length === 0 && editingId === null ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <p className="text-sm text-slate-600">Keine Festbezüge erfasst.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {grossPayments.map((p) => (
              <GrossPaymentRow
                key={String(p.id ?? Math.random())}
                payment={p}
                isEditing={editingId === p.id}
                onEdit={() => setEditingId(p.id ?? null)}
                onCancel={() => setEditingId(null)}
                profile={profile}
                onSaved={async () => {
                  setEditingId(null);
                  await onSaved();
                }}
                setError={setError}
              />
            ))}
          </div>
        )}

        {editingId === "new" ? (
          <NewGrossPaymentForm
            profile={profile}
            onSaved={async () => {
              setEditingId(null);
              await onSaved();
            }}
            onCancel={() => setEditingId(null)}
            setError={setError}
          />
        ) : (
          <button
            onClick={() => setEditingId("new")}
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-400 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-600 hover:bg-slate-50"
          >
            + Neuer Festbezug
          </button>
        )}
      </Section>

      <Section title="Stundenlöhne 1–5">
        <p className="mb-3 text-xs text-slate-500">
          Pro Mitarbeiter sind in DATEV bis zu fünf verschiedene Stundensätze hinterlegbar
          (z.B. Grundlohn, Nachtdienst, Wochenende). Leerlassen wenn nicht genutzt.
        </p>
        <HourlyWagesEditor profile={profile} onSaved={onSaved} setError={setError} />
      </Section>
    </div>
  );
}

function GrossPaymentRow({
  payment,
  isEditing,
  onEdit,
  onCancel,
  profile,
  onSaved,
  setError,
}: {
  payment: NonNullable<Profile["bezuege"]["gross_payments"]>[number];
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  profile: Profile;
  onSaved: () => Promise<void> | void;
  setError: (s: string) => void;
}) {
  if (isEditing) {
    return (
      <GrossPaymentEditForm
        profile={profile}
        existing={payment}
        onSaved={onSaved}
        onCancel={onCancel}
        setError={setError}
      />
    );
  }
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div>
        <div className="font-medium text-slate-900">
          {describeSalaryType(payment.salary_type_id)}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          {describeInterval(payment.payment_interval)}
          {payment.reference_date ? ` · gültig ab ${payment.reference_date}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono tabular-nums text-slate-900">
          {(payment.amount ?? 0).toLocaleString("de-DE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} €
        </span>
        <button
          onClick={onEdit}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Bearbeiten
        </button>
      </div>
    </div>
  );
}

function GrossPaymentEditForm({
  profile,
  existing,
  onSaved,
  onCancel,
  setError,
}: {
  profile: Profile;
  existing: NonNullable<Profile["bezuege"]["gross_payments"]>[number];
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
  setError: (s: string) => void;
}) {
  const [salaryType, setSalaryType] = useState(String(existing.salary_type_id ?? "2000"));
  const [amount, setAmount] = useState(String(existing.amount ?? ""));
  const [refDate, setRefDate] = useState(
    existing.reference_date ?? new Date().toISOString().slice(0, 7)
  );
  const [interval, setInterval] = useState(existing.payment_interval ?? "monthly");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const idNum = typeof existing.id === "string" ? Number(existing.id) : existing.id;
      await api(`/datev/employees/${profile.personnel_number}/bezuege/gross-payment`, {
        method: "PUT",
        json: {
          gross_payment_id: idNum,
          salary_type_id: Number(salaryType),
          amount: Number(amount),
          reference_date: refDate,
          payment_interval: interval,
        },
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  const setToZero = async () => {
    setAmount("0");
    setSaving(true);
    setError("");
    try {
      const idNum = typeof existing.id === "string" ? Number(existing.id) : existing.id;
      await api(`/datev/employees/${profile.personnel_number}/bezuege/gross-payment`, {
        method: "PUT",
        json: {
          gross_payment_id: idNum,
          salary_type_id: Number(salaryType),
          amount: 0,
          reference_date: refDate,
          payment_interval: interval,
        },
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Konnte nicht deaktivieren");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border-2 border-slate-900 bg-white px-4 py-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Lohnart">
          <SalaryTypeSelect value={salaryType} onChange={setSalaryType} />
        </Field>
        <Field label="Betrag (€)">
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputCls} font-mono text-right`}
          />
        </Field>
        <Field label="Intervall">
          <select
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
            className={inputCls}
          >
            <option value="monthly">Monatlich</option>
            <option value="quarterly">Quartalsweise</option>
            <option value="semiannually">Halbjährlich</option>
            <option value="annually">Jährlich</option>
          </select>
        </Field>
        <Field label="Gültig ab (YYYY-MM)">
          <input
            value={refDate}
            onChange={(e) => setRefDate(e.target.value)}
            placeholder="2026-04"
            className={inputCls}
          />
        </Field>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={setToZero}
          disabled={saving}
          className="text-xs text-red-700 underline-offset-2 hover:underline"
          title="DATEV unterstützt kein Löschen, aber ein Festbezug auf 0 € wird ignoriert"
        >
          Auf 0 € setzen (deaktivieren)
        </button>
        <div className="flex gap-2">
          <button onClick={onCancel} disabled={saving} className={btnSecondary}>
            Abbrechen
          </button>
          <button onClick={save} disabled={saving || !amount} className={btnPrimary}>
            {saving ? "Speichern …" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewGrossPaymentForm({
  profile,
  onSaved,
  onCancel,
  setError,
}: {
  profile: Profile;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
  setError: (s: string) => void;
}) {
  const [salaryType, setSalaryType] = useState("2000");
  const [amount, setAmount] = useState("");
  const [refDate, setRefDate] = useState(new Date().toISOString().slice(0, 7));
  const [interval, setInterval] = useState("monthly");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api(`/datev/employees/${profile.personnel_number}/bezuege/gross-payment`, {
        method: "PUT",
        json: {
          salary_type_id: Number(salaryType),
          amount: Number(amount),
          reference_date: refDate,
          payment_interval: interval,
        },
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Konnte nicht hinzufügen");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border-2 border-slate-900 bg-white px-4 py-4">
      <div className="mb-3 text-sm font-semibold text-slate-900">Neuen Festbezug anlegen</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Lohnart">
          <SalaryTypeSelect value={salaryType} onChange={setSalaryType} />
        </Field>
        <Field label="Betrag (€)">
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            className={`${inputCls} font-mono text-right`}
          />
        </Field>
        <Field label="Intervall">
          <select
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
            className={inputCls}
          >
            <option value="monthly">Monatlich</option>
            <option value="quarterly">Quartalsweise</option>
            <option value="semiannually">Halbjährlich</option>
            <option value="annually">Jährlich</option>
          </select>
        </Field>
        <Field label="Gültig ab (YYYY-MM)">
          <input
            value={refDate}
            onChange={(e) => setRefDate(e.target.value)}
            placeholder="2026-04"
            className={inputCls}
          />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCancel} disabled={saving} className={btnSecondary}>
          Abbrechen
        </button>
        <button onClick={save} disabled={saving || !amount} className={btnPrimary}>
          {saving ? "Anlegen …" : "Festbezug anlegen"}
        </button>
      </div>
    </div>
  );
}

function SalaryTypeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const isCustom = !COMMON_SALARY_TYPES.some((s) => String(s.id) === value);
  const [showCustom, setShowCustom] = useState(isCustom);

  if (showCustom) {
    return (
      <div className="flex gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="z.B. 1234"
          className={`${inputCls} font-mono`}
        />
        <button
          onClick={() => {
            setShowCustom(false);
            if (!COMMON_SALARY_TYPES.some((s) => String(s.id) === value)) onChange("2000");
          }}
          className="rounded-lg border border-slate-300 bg-white px-2 text-xs hover:bg-slate-100"
          title="Liste"
        >
          ☰
        </button>
      </div>
    );
  }
  return (
    <div className="flex gap-1">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {COMMON_SALARY_TYPES.map((s) => (
          <option key={s.id} value={String(s.id)}>
            {s.id} – {s.label}
          </option>
        ))}
      </select>
      <button
        onClick={() => setShowCustom(true)}
        className="rounded-lg border border-slate-300 bg-white px-2 text-xs hover:bg-slate-100"
        title="Eigene Nummer eingeben"
      >
        ✎
      </button>
    </div>
  );
}

function HourlyWagesEditor({
  profile,
  onSaved,
  setError,
}: {
  profile: Profile;
  onSaved: () => Promise<void> | void;
  setError: (s: string) => void;
}) {
  const wages = profile.bezuege.hourly_wages ?? [];

  // Map current values + drafts. Draft = string in input; null = no change.
  const initial: Record<number, string> = {};
  for (const w of wages) {
    const id = Number(w.id);
    if (id >= 1 && id <= 5) initial[id] = String(w.amount ?? "");
  }
  const [drafts, setDrafts] = useState<Record<number, string>>(initial);
  const [savingId, setSavingId] = useState<number | null>(null);

  const save = async (id: number) => {
    setSavingId(id);
    setError("");
    try {
      await api(`/datev/employees/${profile.personnel_number}/bezuege/hourly-wage`, {
        method: "PUT",
        json: { hourly_wage_id: id, amount: Number(drafts[id] ?? 0) },
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((id) => {
        const original = initial[id] ?? "";
        const current = drafts[id] ?? "";
        const dirty = current !== original;
        return (
          <div
            key={id}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2"
          >
            <span className="w-20 text-sm font-medium text-slate-700">Lohn {id}</span>
            <div className="relative flex-1">
              <input
                type="number"
                step="0.01"
                value={current}
                onChange={(e) => setDrafts((d) => ({ ...d, [id]: e.target.value }))}
                placeholder="—"
                className={`${inputCls} pr-8 font-mono text-right`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                €/h
              </span>
            </div>
            <button
              onClick={() => save(id)}
              disabled={!dirty || savingId !== null}
              className={`min-w-[90px] rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                dirty
                  ? "bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                  : "border border-slate-200 bg-slate-50 text-slate-400"
              }`}
            >
              {savingId === id ? "…" : dirty ? "Speichern" : "Gespeichert"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function PattiTab({
  profile,
  onChanged,
  setError,
}: {
  profile: Profile;
  onChanged: () => Promise<void> | void;
  setError: (s: string) => void;
}) {
  const [pattiId, setPattiId] = useState<string>(String(profile.patti.person_id ?? ""));
  const [busy, setBusy] = useState(false);

  const link = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/datev/employees/${profile.personnel_number}/link-patti`, {
        method: "POST",
        json: { patti_person_id: Number(pattiId) },
      });
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verknüpfung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/datev/employees/${profile.personnel_number}/link-patti`, {
        method: "DELETE",
      });
      setPattiId("");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trennen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 px-6 py-5">
      <Section title="Patti-Verknüpfung">
        {profile.patti.linked ? (
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <div className="font-semibold">
              {profile.patti.first_name} {profile.patti.last_name} (Patti-ID {profile.patti.person_id})
            </div>
            <div className="mt-1 text-xs">
              Geboren {formatDate(profile.patti.born_at)} · {profile.patti.address?.address_line ?? "—"},{" "}
              {profile.patti.address?.zip_code} {profile.patti.address?.city}
            </div>
            <div className="mt-1 text-xs">
              Letzter Patti-Sync: {formatDateTime(profile.last_patti_synced_at)}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Dieser Mitarbeiter ist nicht mit einem Patti-Eintrag verknüpft. Telefon und E-Mail
            können nur über Patti gepflegt werden — bitte verknüpfen, sofern in Patti vorhanden.
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <Field label="Patti-Person-ID">
            <input
              type="number"
              value={pattiId}
              onChange={(e) => setPattiId(e.target.value)}
              className={inputCls}
            />
          </Field>
          <div className="flex items-end gap-2">
            <button onClick={link} disabled={busy || !pattiId} className={btnPrimary}>
              Verknüpfen
            </button>
            {profile.patti.linked ? (
              <button onClick={unlink} disabled={busy} className={btnSecondary}>
                Trennen
              </button>
            ) : null}
          </div>
        </div>
      </Section>
    </div>
  );
}

function QueueTab({ profile }: { profile: Profile }) {
  if (profile.pending_operations.length === 0) {
    return (
      <div className="px-6 py-5 text-sm text-slate-500">
        Keine offenen Aufträge — alle Änderungen sind synchronisiert.
      </div>
    );
  }
  return (
    <div className="space-y-3 px-6 py-5">
      {profile.pending_operations.map((o) => (
        <div
          key={o.id}
          className={`rounded-xl border px-4 py-3 ${
            o.status === "error"
              ? "border-red-200 bg-red-50"
              : o.status === "in_progress"
              ? "border-blue-200 bg-blue-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <div className="flex items-baseline justify-between">
            <code className="text-xs">{o.op}</code>
            <span className="text-xs text-slate-600">
              {o.status} · {o.attempts} Versuch{o.attempts === 1 ? "" : "e"}
            </span>
          </div>
          {o.last_error ? (
            <div className="mt-1 text-xs text-red-800">{o.last_error}</div>
          ) : null}
          <div className="mt-1 text-xs text-slate-500">
            erstellt {formatDateTime(o.created_at)}
            {o.last_attempt_at ? ` · letzter Versuch ${formatDateTime(o.last_attempt_at)}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- shared form bits -----------------------------------------------------

const inputCls =
  "w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";
const btnPrimary =
  "rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-800 disabled:opacity-50";
const btnSecondary =
  "rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-50";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{title}</h4>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function SaveBar({ onSave, disabled }: { onSave: () => void; disabled: boolean }) {
  return (
    <div className="flex justify-end border-t border-slate-200 pt-4">
      <button onClick={onSave} disabled={disabled} className={btnPrimary}>
        Änderungen einreihen
      </button>
    </div>
  );
}
