"use client";

import { useEffect, useState } from "react";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";

type Notification = {
  id: number;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
};

export default function NachrichtenPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    fetchWithRefresh(`${API_BASE_URL}/mobile/notifications`, {
      headers: buildHeaders(),
    })
      .then((r) => r.json())
      .then((data: Notification[]) => setNotifications(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function markAllRead() {
    setMarking(true);
    try {
      await fetchWithRefresh(`${API_BASE_URL}/mobile/notifications/read-all`, {
        method: "POST",
        headers: buildHeaders(),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {}
    setMarking(false);
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/60" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur sm:rounded-3xl sm:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Nachrichten
          </h1>
          {unreadCount > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              {unreadCount} ungelesen
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            disabled={marking}
            className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {marking ? "..." : "Alle gelesen"}
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
          Keine Nachrichten vorhanden.
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`rounded-2xl border p-3 shadow-sm sm:p-4 ${
                n.read
                  ? "border-slate-200 bg-white"
                  : "border-brand-200 bg-brand-50/50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${n.read ? "text-slate-700" : "text-slate-900"}`}>
                    {!n.read && (
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand-500" />
                    )}
                    {n.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    {n.body}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {new Date(n.created_at).toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
