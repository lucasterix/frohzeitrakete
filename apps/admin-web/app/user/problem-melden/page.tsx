"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchWithRefresh,
  buildHeaders,
  API_BASE_URL,
} from "@/lib/api-helpers";
import { AlertCircleIcon, CheckCircleIcon } from "@/components/icons";

export default function ProblemMeldenPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("bug");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError("Bitte Titel und Beschreibung angeben.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const ua = navigator.userAgent || "unbekannt";
      const res = await fetchWithRefresh(`${API_BASE_URL}/mobile/it-tickets`, {
        method: "POST",
        headers: { ...buildHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          device_info: `Web-App | ${ua.substring(0, 200)}`,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || "Fehler beim Absenden");
      }
      setSuccess(true);
      setTitle("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <button
          onClick={() => router.back()}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          &larr; Zurueck
        </button>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          Problem melden
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Melde einen Fehler, stelle eine Frage oder wuensche dir ein Feature.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircleIcon className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircleIcon className="h-5 w-5 shrink-0" />
          Ticket erstellt! Das Team schaut sich dein Anliegen an.
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Titel
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="Kurze Beschreibung des Problems"
            maxLength={255}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Beschreibung
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="Was ist passiert? Wann tritt der Fehler auf? Welche Seite war betroffen?"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Kategorie
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="bug">Fehler / Bug</option>
            <option value="feature">Feature-Wunsch</option>
            <option value="frage">Frage</option>
            <option value="sonstiges">Sonstiges</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {submitting ? "Wird gesendet..." : "Ticket absenden"}
        </button>
      </form>
    </div>
  );
}
