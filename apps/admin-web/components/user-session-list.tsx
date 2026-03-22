"use client";

import { useEffect, useState } from "react";
import { SessionInfo, getUserSessions, revokeUserSession } from "@/lib/api";

type Props = {
  userId: number;
};

export default function UserSessionList({ userId }: Props) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadSessions() {
    setLoading(true);
    setErrorMessage("");

    try {
      const data = await getUserSessions(userId);
      setSessions(data);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Fehler beim Laden der Sessions"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(sessionId: number) {
    try {
      await revokeUserSession(userId, sessionId);
      await loadSessions();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Fehler beim Widerrufen");
    }
  }

  useEffect(() => {
    loadSessions();
  }, [userId]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-800">Geräte / Sessions</h4>
        <button
          onClick={loadSessions}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Neu laden
        </button>
      </div>

      {loading ? <p className="text-sm text-slate-600">Lade Sessions...</p> : null}

      {errorMessage ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      {!loading && !errorMessage && sessions.length === 0 ? (
        <p className="text-sm text-slate-600">Keine Sessions gefunden.</p>
      ) : null}

      {!loading && !errorMessage && sessions.length > 0 ? (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="rounded-xl border border-slate-200 bg-white p-3"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">
                      {session.device_label || "Unbekanntes Gerät"}
                    </span>
                    {session.is_current ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        aktuelle Session
                      </span>
                    ) : null}
                    {session.revoked_at ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        widerrufen
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 space-y-1 text-xs text-slate-500">
                    <p>IP: {session.ip_address || "-"}</p>
                    <p>Created: {new Date(session.created_at).toLocaleString()}</p>
                    <p>Last used: {new Date(session.last_used_at).toLocaleString()}</p>
                    <p>Expires: {new Date(session.expires_at).toLocaleString()}</p>
                    <p className="break-all">User-Agent: {session.user_agent || "-"}</p>
                  </div>
                </div>

                {!session.revoked_at ? (
                  <button
                    onClick={() => handleRevoke(session.id)}
                    className="rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Session widerrufen
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}