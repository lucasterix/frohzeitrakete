"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const DATEV_API_BASE_URL =
  process.env.NEXT_PUBLIC_DATEV_API_BASE_URL ||
  "https://buchhaltung-api.froehlichdienste.de";

type DatevStatus = {
  connected: boolean;
  environment: string;
  scope?: string;
  access_token_expires_in_seconds?: number;
  has_refresh_token?: boolean;
  connected_by_email?: string | null;
  id_token_claims?: Record<string, unknown> | null;
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
  source_system: string | null;
  is_active: boolean;
  has_pending_changes: boolean;
  pending_since: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
};

type EmployeeDetail = Employee & {
  raw_masterdata: Record<string, unknown> | null;
  pending_changes: Record<string, unknown> | null;
};

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
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  return response.json() as Promise<T>;
}

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  "1": "Unbefristet Vollzeit",
  "2": "Unbefristet Teilzeit",
  "3": "Befristet Vollzeit",
  "4": "Befristet Teilzeit",
};

function formatDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("de-DE");
}

export default function MitarbeiterPage() {
  const [status, setStatus] = useState<DatevStatus | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<EmployeeDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([
        api<DatevStatus>("/datev/status"),
        api<Employee[]>("/datev/employees"),
      ]);
      setStatus(s);
      setEmployees(e);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ authorize_url: string }>(
        `/datev/oauth/authorize?return_to=${encodeURIComponent(window.location.href)}`
      );
      window.location.href = r.authorize_url;
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Verbindungsfehler");
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/datev/disconnect`, { method: "POST" });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Trennen");
    } finally {
      setBusy(false);
    }
  };

  const syncFromDatev = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ ok: boolean; count?: number; status?: number; body?: unknown }>(
        `/datev/employees/sync`,
        { method: "POST", json: {} }
      );
      if (!result.ok) {
        setError(
          `DATEV-Sync nicht möglich (HTTP ${result.status}): ${JSON.stringify(result.body).slice(0, 200)}`
        );
      }
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Sync");
    } finally {
      setBusy(false);
    }
  };

  const loadFixture = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/datev/employees/sync-fixture`, { method: "POST" });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Fixture-Load");
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (pnr: number) => {
    setError("");
    try {
      const d = await api<EmployeeDetail>(`/datev/employees/${pnr}`);
      setSelected(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Öffnen");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(q) ||
        e.job_title?.toLowerCase().includes(q) ||
        String(e.personnel_number).includes(q)
    );
  }, [employees, search]);

  const connectedClaims = status?.id_token_claims as
    | { name?: string; preferred_username?: string }
    | null
    | undefined;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Mitarbeiter &amp; Lohn</h2>
        <p className="mt-1 text-sm text-slate-600">
          Stammdaten aus DATEV Lohn und Gehalt. Änderungen werden lokal gesammelt und
          anschließend via DATEV-API oder ASCII-Import in den Bestand übertragen.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">
              DATEV-Verbindung ({status?.environment ?? "…"})
            </div>
            {status === null && !error ? (
              <div className="mt-1 text-sm text-slate-500">wird geladen …</div>
            ) : status?.connected ? (
              <div className="mt-1 space-y-1 text-sm text-slate-700">
                <div>
                  <span className="font-medium">Angemeldet:</span>{" "}
                  {connectedClaims?.name ?? status.connected_by_email}
                </div>
                <div className="truncate">
                  <span className="font-medium">Scope:</span>{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 text-xs">
                    {status.scope || "—"}
                  </code>
                </div>
                <div>
                  <span className="font-medium">Access-Token TTL:</span>{" "}
                  {status.access_token_expires_in_seconds}s
                  {status.has_refresh_token ? " (Refresh OK)" : " (⚠️ ohne Refresh)"}
                </div>
              </div>
            ) : (
              <div className="mt-1 text-sm text-slate-500">Noch nicht verbunden.</div>
            )}
          </div>
          <div className="flex gap-2">
            {status?.connected ? (
              <button
                onClick={disconnect}
                disabled={busy}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
              >
                Verbindung lösen
              </button>
            ) : (
              <button
                onClick={connect}
                disabled={busy}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-800 disabled:opacity-50"
              >
                Mit DATEV verbinden
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          placeholder="Suche: Name, Personalnummer, Position …"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <div className="flex gap-2">
          <button
            onClick={syncFromDatev}
            disabled={busy || !status?.connected}
            title={!status?.connected ? "Erst DATEV verbinden" : "Pullt Stammdaten aus DATEV"}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-800 disabled:opacity-50"
          >
            Aus DATEV aktualisieren
          </button>
          <button
            onClick={loadFixture}
            disabled={busy}
            title="Testdaten laden, solange die DATEV-Sandbox nicht antwortet"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
          >
            Testdaten laden
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Noch keine Mitarbeiter geladen. „Aus DATEV aktualisieren" (wenn freigeschaltet)
            oder „Testdaten laden" klicken.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">PersNr</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Tätigkeit</th>
                <th className="px-4 py-3 text-left">Vertrag</th>
                <th className="px-4 py-3 text-right">Std./Woche</th>
                <th className="px-4 py-3 text-left">Eintritt</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => openDetail(e.personnel_number)}
                  className="cursor-pointer transition hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {e.personnel_number}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {e.full_name}
                    {e.has_pending_changes ? (
                      <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                        Änderung offen
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{e.job_title ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {e.type_of_contract
                      ? CONTRACT_TYPE_LABELS[e.type_of_contract] ?? e.type_of_contract
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                    {e.weekly_working_hours ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{formatDate(e.date_of_joining)}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected ? (
        <EmployeeDrawer
          employee={selected}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            await loadAll();
            const fresh = await api<EmployeeDetail>(
              `/datev/employees/${selected.personnel_number}`
            );
            setSelected(fresh);
          }}
        />
      ) : null}
    </div>
  );
}

function EmployeeDrawer({
  employee,
  onClose,
  onSaved,
}: {
  employee: EmployeeDetail;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const pending = (employee.pending_changes ?? {}) as Record<string, unknown>;
  const [weeklyHours, setWeeklyHours] = useState<string>(
    String(
      (pending.weekly_working_hours as number | undefined) ??
        employee.weekly_working_hours ??
        ""
    )
  );
  const [grossSalary, setGrossSalary] = useState<string>(
    String((pending.monthly_gross_salary_eur as number | undefined) ?? "")
  );
  const [note, setNote] = useState<string>((pending.note as string | undefined) ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      const payload: Record<string, unknown> = {};
      if (weeklyHours !== "") payload.weekly_working_hours = Number(weeklyHours);
      if (grossSalary !== "") payload.monthly_gross_salary_eur = Number(grossSalary);
      if (note !== "") payload.note = note;
      await api(`/datev/employees/${employee.personnel_number}/pending`, {
        method: "PATCH",
        json: payload,
      });
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const clearPending = async () => {
    setSaving(true);
    setErr("");
    try {
      await api(`/datev/employees/${employee.personnel_number}/pending`, {
        method: "PATCH",
        json: {},
      });
      await onSaved();
      setWeeklyHours(String(employee.weekly_working_hours ?? ""));
      setGrossSalary("");
      setNote("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler beim Zurücksetzen");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-slate-900/30"
        onClick={onClose}
        aria-label="Schließen"
      />
      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="text-xs text-slate-500">PersNr {employee.personnel_number}</div>
            <h3 className="text-lg font-semibold text-slate-900">{employee.full_name}</h3>
            <div className="text-sm text-slate-600">
              {employee.job_title ?? "—"}
              {employee.type_of_contract
                ? ` · ${
                    CONTRACT_TYPE_LABELS[employee.type_of_contract] ?? employee.type_of_contract
                  }`
                : ""}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <section>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Stammdaten (DATEV)
            </h4>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-500">Geburtsdatum</dt>
              <dd>{formatDate(employee.date_of_birth)}</dd>
              <dt className="text-slate-500">Eintritt</dt>
              <dd>{formatDate(employee.date_of_joining)}</dd>
              <dt className="text-slate-500">Austritt</dt>
              <dd>{formatDate(employee.date_of_leaving)}</dd>
              <dt className="text-slate-500">Wochenstunden (DATEV)</dt>
              <dd>{employee.weekly_working_hours ?? "—"}</dd>
              <dt className="text-slate-500">Vertrag</dt>
              <dd>
                {employee.type_of_contract
                  ? CONTRACT_TYPE_LABELS[employee.type_of_contract] ?? employee.type_of_contract
                  : "—"}
              </dd>
              <dt className="text-slate-500">Quelle</dt>
              <dd>
                {employee.source_system ?? "—"}
                {employee.last_synced_at ? ` · zuletzt ${formatDate(employee.last_synced_at)}` : ""}
              </dd>
            </dl>
          </section>

          <section>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Änderung (lokal, noch nicht in DATEV)
            </h4>
            <div className="mt-2 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  Wochenstunden neu
                </span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  step="0.5"
                  value={weeklyHours}
                  onChange={(e) => setWeeklyHours(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  Monats-Bruttogehalt (EUR) neu — optional
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={grossSalary}
                  onChange={(e) => setGrossSalary(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  Notiz (intern)
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
              </label>
              {employee.has_pending_changes ? (
                <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Änderung wartet im lokalen Stapel —{" "}
                  {employee.pending_since ? formatDate(employee.pending_since) : "jetzt"}. Wird beim
                  nächsten Monatsabschluss an DATEV übertragen.
                </div>
              ) : null}
              {err ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {err}
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-200 px-6 py-4">
          <button
            onClick={clearPending}
            disabled={saving || !employee.has_pending_changes}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
          >
            Änderung zurücksetzen
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Speichern …" : "Lokal speichern"}
          </button>
        </div>
      </aside>
    </div>
  );
}
