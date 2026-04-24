"use client";

import { useEffect, useState } from "react";

const DATEV_API_BASE_URL =
  process.env.NEXT_PUBLIC_DATEV_API_BASE_URL ||
  "https://buchhaltung-api.froehlichdienste.de";

type DatevStatus = {
  connected: boolean;
  environment: string;
  scope?: string;
  connected_at?: string;
  last_refreshed_at?: string | null;
  access_token_expires_in_seconds?: number;
  has_refresh_token?: boolean;
  connected_by_email?: string | null;
  id_token_claims?: Record<string, unknown> | null;
  scopes_requested?: string[];
};

export default function MitarbeiterPage() {
  const [status, setStatus] = useState<DatevStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadStatus() {
    setError("");
    try {
      const r = await fetch(`${DATEV_API_BASE_URL}/datev/status`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setStatus(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `${DATEV_API_BASE_URL}/datev/oauth/authorize?return_to=${encodeURIComponent(
          window.location.href
        )}`,
        { credentials: "include" }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { authorize_url } = await r.json();
      window.location.href = authorize_url;
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Verbindungsfehler");
    }
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`${DATEV_API_BASE_URL}/datev/disconnect`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Trennen");
    } finally {
      setBusy(false);
    }
  }

  const connectedClaims = status?.id_token_claims as
    | { name?: string; preferred_username?: string; sub?: string }
    | null
    | undefined;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Mitarbeiter &amp; Lohn</h2>
        <p className="mt-1 text-sm text-slate-600">
          Stammdaten aus DATEV Lohn und Gehalt, Stunden &amp; Gehalt pflegen,
          Änderungen per ASCII-Import an das DATEV-Rechenzentrum zurück.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              DATEV-Verbindung ({status?.environment ?? "…"})
            </div>
            {status === null && !error ? (
              <div className="mt-1 text-sm text-slate-500">Status wird geladen …</div>
            ) : error ? (
              <div className="mt-1 text-sm text-red-700">{error}</div>
            ) : status?.connected ? (
              <div className="mt-1 space-y-1 text-sm text-slate-700">
                <div>
                  <span className="font-medium">Verbunden als:</span>{" "}
                  {connectedClaims?.name ?? connectedClaims?.preferred_username ?? status.connected_by_email}
                </div>
                <div>
                  <span className="font-medium">Scope:</span>{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 text-xs">{status.scope}</code>
                </div>
                <div>
                  <span className="font-medium">Access-Token läuft in:</span>{" "}
                  {status.access_token_expires_in_seconds}s
                  {status.has_refresh_token ? " (Refresh-Token vorhanden)" : " (⚠️ ohne Refresh)"}
                </div>
              </div>
            ) : (
              <div className="mt-1 text-sm text-slate-500">
                Noch nicht verbunden — erforderlich für Mitarbeiter-Sync.
              </div>
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

      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        Mitarbeiterliste + Edit-UI kommt, sobald die Verbindung steht und der
        erste <code>hr:exchange</code>-Pull die Stammdaten liefert.
      </div>
    </div>
  );
}
