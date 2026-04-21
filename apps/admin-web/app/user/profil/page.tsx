"use client";

import { useEffect, useState } from "react";
import { getMe, User } from "@/lib/api";
import {
  fetchWithRefresh,
  buildHeaders,
  API_BASE_URL,
} from "@/lib/api-helpers";

export default function ProfilPage() {
  const [me, setMe] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Password change
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [pwBusy, setPwBusy] = useState(false);

  // Sessions
  const [sessionMsg, setSessionMsg] = useState<string | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    setPwBusy(true);
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/auth/change-password`,
        {
          method: "POST",
          headers: { ...buildHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            old_password: oldPw,
            new_password: newPw,
          }),
        }
      );
      if (res.status === 204 || res.ok) {
        setPwMsg({ ok: true, text: "Passwort erfolgreich geaendert." });
        setOldPw("");
        setNewPw("");
      } else {
        const data = await res.json().catch(() => null);
        setPwMsg({
          ok: false,
          text: data?.detail || "Fehler beim Aendern des Passworts.",
        });
      }
    } catch {
      setPwMsg({ ok: false, text: "Netzwerkfehler." });
    } finally {
      setPwBusy(false);
    }
  }

  async function handleLogoutAll() {
    setSessionBusy(true);
    setSessionMsg(null);
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/auth/logout-all`,
        {
          method: "POST",
          headers: buildHeaders(),
        }
      );
      if (res.ok || res.status === 204) {
        setSessionMsg("Alle Sessions wurden abgemeldet.");
      } else {
        setSessionMsg("Fehler beim Abmelden.");
      }
    } catch {
      setSessionMsg("Netzwerkfehler.");
    } finally {
      setSessionBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-2xl bg-white/60" />
        <div className="h-48 animate-pulse rounded-2xl bg-white/60" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
        Mein Profil
      </h1>

      {/* Profil-Info */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Persoenliche Daten
        </h2>
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Name</span>
            <span className="text-sm font-medium text-slate-900">
              {me?.full_name ?? "–"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">E-Mail</span>
            <span className="text-sm font-medium text-slate-900">
              {me?.email ?? "–"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Rolle</span>
            <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
              {me?.role ?? "–"}
            </span>
          </div>
        </div>
      </div>

      {/* Passwort aendern */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Passwort aendern
        </h2>
        <form onSubmit={handleChangePassword} className="mt-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600">
              Aktuelles Passwort
            </label>
            <input
              type="password"
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">
              Neues Passwort
            </label>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              required
              minLength={8}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          {pwMsg && (
            <p
              className={`text-xs ${
                pwMsg.ok ? "text-green-600" : "text-red-600"
              }`}
            >
              {pwMsg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={pwBusy}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {pwBusy ? "Wird gespeichert..." : "Passwort aendern"}
          </button>
        </form>
      </div>

      {/* Sessions */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Aktive Sessions
        </h2>
        <p className="mt-2 text-xs text-slate-500">
          Falls du dich auf allen Geraeten abmelden moechtest, nutze den Button
          unten. Du wirst danach erneut eingeloggt werden muessen.
        </p>
        {sessionMsg && (
          <p className="mt-2 text-xs text-green-600">{sessionMsg}</p>
        )}
        <button
          onClick={handleLogoutAll}
          disabled={sessionBusy}
          className="mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
        >
          {sessionBusy ? "Wird abgemeldet..." : "Alle Sessions abmelden"}
        </button>
      </div>

      {/* Biometrie */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Biometrische Anmeldung
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Die biometrische Anmeldung (Face ID / Fingerabdruck) kann in der
          FrohZeit Mobile-App unter Einstellungen aktiviert werden.
        </p>
      </div>
    </div>
  );
}
