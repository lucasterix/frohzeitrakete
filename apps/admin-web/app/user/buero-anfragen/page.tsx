"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";
import { AlertCircleIcon, CheckCircleIcon } from "@/components/icons";

const HR_CATEGORIES = [
  "Überstundenauszahlung",
  "Verdienstbescheinigung",
  "Gehaltsvorschuss",
  "Adressänderung",
  "Nebenverdienstbescheinigung",
  "Sonstiges",
];

const DOC_CATEGORIES = [
  "Betreuungsvertrag-Kopie",
  "Bescheinigung",
  "Sonstige Unterlagen",
];

type Tab = "urlaub" | "krank" | "hr" | "vertretung" | "dokumente";

export default function BueroAnfragenPage() {
  const [tab, setTab] = useState<Tab>("urlaub");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);

  // Urlaub
  const [urlaubFrom, setUrlaubFrom] = useState("");
  const [urlaubTo, setUrlaubTo] = useState("");
  const [urlaubNote, setUrlaubNote] = useState("");

  // Krank
  const [krankFrom, setKrankFrom] = useState(new Date().toISOString().slice(0, 10));
  const [krankTo, setKrankTo] = useState(new Date().toISOString().slice(0, 10));
  const [krankNote, setKrankNote] = useState("");

  // HR
  const [hrCategory, setHrCategory] = useState(HR_CATEGORIES[0]);
  const [hrNote, setHrNote] = useState("");

  // Vertretung
  const [vertretungDate, setVertretungDate] = useState("");
  const [vertretungNote, setVertretungNote] = useState("");

  // Dokumente
  const [docCategory, setDocCategory] = useState(DOC_CATEGORIES[0]);
  const [docNote, setDocNote] = useState("");

  const loadRequests = useCallback(async () => {
    try {
      const endpoints: Record<Tab, string> = {
        urlaub: "/mobile/vacation-requests",
        krank: "/mobile/sick-leaves",
        hr: "/mobile/hr-requests",
        vertretung: "/mobile/vacation-requests",
        dokumente: "/mobile/hr-requests",
      };
      const res = await fetchWithRefresh(
        `${API_BASE_URL}${endpoints[tab]}`,
        { headers: buildHeaders() }
      );
      if (res.ok) setRequests(await res.json());
    } catch {}
  }, [tab]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  async function submit(endpoint: string, body: Record<string, any>) {
    setSubmitting(true);
    setError("");
    setFlash("");
    try {
      const res = await fetchWithRefresh(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { ...buildHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Fehler");
      }
      setFlash("Anfrage eingereicht! Das Büro wird benachrichtigt.");
      await loadRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSubmitting(false);
    }
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "urlaub", label: "Urlaub", icon: "🏖️" },
    { key: "krank", label: "Krank", icon: "🤒" },
    { key: "hr", label: "HR-Anfrage", icon: "📄" },
    { key: "vertretung", label: "Vertretung", icon: "🔄" },
    { key: "dokumente", label: "Dokumente", icon: "📑" },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Anfrage ans Büro
        </h1>
        <p className="mt-1 text-xs text-slate-600">
          Urlaub beantragen, Krankmeldung einreichen, HR-Anfrage, Vertretung oder Dokumente anfordern.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <AlertCircleIcon className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {flash && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <CheckCircleIcon className="h-4 w-4 shrink-0" /> {flash}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setError(""); setFlash(""); }}
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-medium transition sm:text-sm ${
              tab === t.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        {/* Urlaub */}
        {tab === "urlaub" && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Von</span>
                <input type="date" value={urlaubFrom} onChange={(e) => setUrlaubFrom(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Bis</span>
                <input type="date" value={urlaubTo} onChange={(e) => setUrlaubTo(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400" />
              </label>
            </div>
            <textarea value={urlaubNote} onChange={(e) => setUrlaubNote(e.target.value)}
              placeholder="Bemerkung (optional)" rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400" />
            <button onClick={() => submit("/mobile/vacation-requests", {
              from_date: urlaubFrom, to_date: urlaubTo, note: urlaubNote.trim() || null,
            })} disabled={submitting || !urlaubFrom || !urlaubTo}
              className="w-full rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
              {submitting ? "Wird eingereicht …" : "Urlaubsantrag einreichen"}
            </button>
          </div>
        )}

        {/* Krank */}
        {tab === "krank" && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Von</span>
                <input type="date" value={krankFrom} onChange={(e) => setKrankFrom(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Bis</span>
                <input type="date" value={krankTo} onChange={(e) => setKrankTo(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400" />
              </label>
            </div>
            <textarea value={krankNote} onChange={(e) => setKrankNote(e.target.value)}
              placeholder="Zusatzinfo (optional)" rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400" />
            <button onClick={() => submit("/mobile/sick-leaves", {
              from_date: krankFrom, to_date: krankTo, note: krankNote.trim() || null,
            })} disabled={submitting || !krankFrom || !krankTo}
              className="w-full rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              {submitting ? "Wird gemeldet …" : "Krankmeldung einreichen"}
            </button>
          </div>
        )}

        {/* HR */}
        {tab === "hr" && (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Kategorie</span>
              <select value={hrCategory} onChange={(e) => setHrCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400">
                {HR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <textarea value={hrNote} onChange={(e) => setHrNote(e.target.value)}
              placeholder="Details zur Anfrage …" rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400" />
            <button onClick={() => submit("/mobile/hr-requests", {
              category: hrCategory, note: hrNote.trim() || null,
            })} disabled={submitting}
              className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {submitting ? "Wird gesendet …" : "HR-Anfrage senden"}
            </button>
          </div>
        )}

        {/* Vertretung */}
        {tab === "vertretung" && (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              Melde dem Büro, dass du an einem bestimmten Tag eine Vertretung brauchst.
            </p>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Datum</span>
              <input type="date" value={vertretungDate} onChange={(e) => setVertretungDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400" />
            </label>
            <textarea value={vertretungNote} onChange={(e) => setVertretungNote(e.target.value)}
              placeholder="Grund / Details …" rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400" />
            <button onClick={() => submit("/mobile/hr-requests", {
              category: "Vertretungsanfrage", note: `Datum: ${vertretungDate}. ${vertretungNote.trim()}`,
            })} disabled={submitting || !vertretungDate}
              className="w-full rounded-2xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60">
              {submitting ? "Wird gemeldet …" : "Vertretung anfragen"}
            </button>
          </div>
        )}

        {/* Dokumente */}
        {tab === "dokumente" && (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              Fordere ein Dokument vom Büro an (z.B. Vertragskopie, Bescheinigung).
            </p>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Dokumentenart</span>
              <select value={docCategory} onChange={(e) => setDocCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400">
                {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <textarea value={docNote} onChange={(e) => setDocNote(e.target.value)}
              placeholder="Details zur gewünschten Unterlage …" rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400" />
            <button onClick={() => submit("/mobile/hr-requests", {
              category: docCategory, note: docNote.trim() || null,
            })} disabled={submitting}
              className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
              {submitting ? "Wird angefordert …" : "Dokument anfordern"}
            </button>
          </div>
        )}
      </div>

      {/* Bisherige Anfragen */}
      {requests.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Bisherige Anfragen</h2>
          <ul className="space-y-2">
            {requests.map((r: any) => {
              const st: string = r.status || (r.acknowledged_at ? "done" : "open");
              const colorCls = st === "done" || st === "approved"
                ? "text-emerald-700"
                : st === "rejected"
                  ? "text-red-700"
                  : "text-slate-500";
              return (
                <li key={r.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-xs">
                  <span>{r.from_date || r.category || "Anfrage"} {r.to_date ? `– ${r.to_date}` : ""}</span>
                  <span className={`font-semibold uppercase ${colorCls}`}>
                    {r.status || (r.acknowledged_at ? "Bestätigt" : "Offen")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
