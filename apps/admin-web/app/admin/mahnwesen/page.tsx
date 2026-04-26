"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  AvisDocumentRecord,
  AvisEntryRecord,
  MahnwesenStats,
  deleteAvisDocument,
  getAvisDocument,
  getAvisDocuments,
  getMahnwesenStats,
  searchAvisEntries,
  updateAvisDocument,
  updateAvisEntry,
  uploadAvisPdfs,
} from "@/lib/api";
import { useRequireRole } from "@/lib/use-require-role";
import { useCachedFetch } from "@/lib/use-cached-fetch";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  RefreshIcon,
} from "@/components/icons";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(iso)); }
  catch { return iso; }
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

const DOC_STATUS_LABELS: Record<string, string> = {
  parsed: "Geparst",
  reviewed: "Geprüft",
  matched: "Abgeglichen",
  archived: "Archiviert",
};

const DOC_STATUS_CLS: Record<string, string> = {
  parsed: "bg-blue-100 text-blue-700",
  reviewed: "bg-amber-100 text-amber-700",
  matched: "bg-emerald-100 text-emerald-700",
  archived: "bg-slate-100 text-slate-500",
};

const ENTRY_STATUS_CLS: Record<string, string> = {
  unmatched: "bg-red-100 text-red-700",
  matched: "bg-emerald-100 text-emerald-700",
  disputed: "bg-amber-100 text-amber-700",
  written_off: "bg-slate-100 text-slate-500",
};

type View = "overview" | "detail" | "search";

export default function MahnwesenPage() {
  const { isLoading: authLoading, authorized } = useRequireRole(["admin", "buchhaltung", "mahnwesen"]);

  const { data: docs = [], mutate: mutateDocs, isLoading: docsLoading } =
    useCachedFetch<AvisDocumentRecord[]>(authorized ? "mahnwesen/docs" : null, getAvisDocuments);
  const { data: stats, mutate: mutateStats } =
    useCachedFetch<MahnwesenStats>(authorized ? "mahnwesen/stats" : null, getMahnwesenStats);

  const [view, setView] = useState<View>("overview");
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [selectedDoc, setSelectedDoc] = useState<(AvisDocumentRecord & { entries?: AvisEntryRecord[] }) | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<(AvisEntryRecord & { document: AvisDocumentRecord | null })[]>([]);
  const [searching, setSearching] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    if (statusFilter === "all") return docs;
    return docs.filter((d) => d.status === statusFilter);
  }, [docs, statusFilter]);

  async function handleUpload(files: FileList) {
    setUploading(true);
    setError("");
    try {
      const result = await uploadAvisPdfs(Array.from(files));
      const ok = result.filter((r) => !("error" in r)).length;
      const fail = result.length - ok;
      setFlash(`${ok} PDF(s) geparst${fail ? `, ${fail} fehlgeschlagen` : ""}`);
      await mutateDocs();
      await mutateStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload-Fehler");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function openDetail(id: number) {
    setBusyId(id);
    try {
      const doc = await getAvisDocument(id);
      setSelectedDoc(doc);
      setView("detail");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDocUpdate(id: number, field: string, value: string) {
    try {
      await updateAvisDocument(id, { [field]: value });
      if (selectedDoc?.id === id) {
        const updated = await getAvisDocument(id);
        setSelectedDoc(updated);
      }
      await mutateDocs();
      await mutateStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function handleEntryUpdate(entryId: number, matched: string, note?: string) {
    try {
      await updateAvisEntry(entryId, { matched, match_note: note ?? undefined });
      if (selectedDoc) {
        const updated = await getAvisDocument(selectedDoc.id);
        setSelectedDoc(updated);
      }
      await mutateStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Dokument und alle Einträge löschen?")) return;
    try {
      await deleteAvisDocument(id);
      if (selectedDoc?.id === id) { setSelectedDoc(null); setView("overview"); }
      setFlash("Dokument gelöscht.");
      await mutateDocs();
      await mutateStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchAvisEntries(searchQuery.trim());
      setSearchResults(results);
      setView("search");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSearching(false);
    }
  }

  function refresh() {
    mutateDocs();
    mutateStats();
  }

  if (authLoading) return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-brand-600" /></div>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mahnwesen</h1>
          <p className="text-sm text-slate-500">Zahlungsavise hochladen, parsen &amp; abgleichen</p>
        </div>
        <div className="flex gap-2">
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
            <input ref={fileRef} type="file" accept=".pdf" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) handleUpload(e.target.files); }} />
            {uploading ? "Verarbeitet..." : "📄 PDFs hochladen"}
          </label>
          {view !== "overview" && <button onClick={() => { setView("overview"); setSelectedDoc(null); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">← Übersicht</button>}
          <button onClick={refresh} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50">
            <RefreshIcon className={`h-4 w-4 text-slate-600 ${docsLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {flash && <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircleIcon className="h-4 w-4 shrink-0" />{flash}<button onClick={() => setFlash("")} className="ml-auto">&times;</button></div>}
      {error && <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircleIcon className="h-4 w-4 shrink-0" />{error}<button onClick={() => setError("")} className="ml-auto">&times;</button></div>}

      {/* Stats */}
      {stats && view === "overview" && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="Dokumente" value={stats.documents} />
          <Kpi label="Posten gesamt" value={stats.entries} />
          <Kpi label="Gesamtbetrag" value={fmtEur(stats.total_amount)} />
          <Kpi label="Offen" value={stats.unmatched_entries} accent="text-red-600" />
          <Kpi label="Abgeglichen" value={stats.matched_entries} accent="text-emerald-600" />
        </div>
      )}

      {/* Search bar */}
      {view === "overview" && (
        <div className="flex gap-2">
          <input type="text" placeholder="Rechnungsnummer suchen..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400" />
          <button onClick={handleSearch} disabled={searching || !searchQuery.trim()}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {searching ? "..." : "Suchen"}
          </button>
        </div>
      )}

      {/* ═══ OVERVIEW ═══ */}
      {view === "overview" && (
        <>
          <div className="flex gap-1.5">
            {["all", "parsed", "reviewed", "matched", "archived"].map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${statusFilter === s ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {s === "all" ? "Alle" : DOC_STATUS_LABELS[s] ?? s}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center">
              <p className="text-lg font-medium text-slate-400">Noch keine Avise hochgeladen</p>
              <p className="mt-1 text-sm text-slate-400">Lade PDF-Zahlungsavise hoch — der Parser erkennt automatisch die Einzelposten.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((doc) => (
                <button key={doc.id} onClick={() => openDetail(doc.id)}
                  className={`flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition hover:shadow-md ${busyId === doc.id ? "opacity-50" : ""}`}>
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-lg">
                    {doc.doc_type === "AVIS" ? "📑" : doc.doc_type === "POSTEN" ? "📄" : "❓"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900">{doc.filename}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {doc.entry_count} Posten · {fmtEur(doc.total_amount)}
                      {doc.letter_date ? ` · Datum: ${doc.letter_date}` : ""}
                      {doc.beleg_no ? ` · Beleg: ${doc.beleg_no}` : ""}
                    </div>
                  </div>
                  {doc.warnings && <span className="shrink-0 rounded-lg bg-amber-100 px-2 py-1 text-[10px] font-medium text-amber-700">⚠️</span>}
                  <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium ${DOC_STATUS_CLS[doc.status] ?? "bg-slate-100"}`}>
                    {DOC_STATUS_LABELS[doc.status] ?? doc.status}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{fmtDate(doc.created_at)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ DETAIL ═══ */}
      {view === "detail" && selectedDoc && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{selectedDoc.filename}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Typ: {selectedDoc.doc_type} · {selectedDoc.entry_count} Posten · {fmtEur(selectedDoc.total_amount)}
                  {selectedDoc.letter_date ? ` · Briefdatum: ${selectedDoc.letter_date}` : ""}
                  {selectedDoc.beleg_no ? ` · Beleg-Nr: ${selectedDoc.beleg_no}` : ""}
                </p>
                {selectedDoc.warnings && <p className="mt-1 text-xs text-amber-600">⚠️ {selectedDoc.warnings}</p>}
              </div>
              <select value={selectedDoc.status} onChange={(e) => handleDocUpdate(selectedDoc.id, "status", e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500">
                {Object.entries(DOC_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          {/* Entries table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Rechnungs-Nr.</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Betrag</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Notiz</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-600">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {(selectedDoc.entries ?? []).map((e) => (
                  <tr key={e.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-mono text-sm font-medium text-slate-900">{e.invoice_no}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtEur(e.amount_eur)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-block rounded-lg px-2 py-0.5 text-xs font-medium ${ENTRY_STATUS_CLS[e.matched] ?? "bg-slate-100"}`}>
                        {e.matched === "unmatched" ? "Offen" : e.matched === "matched" ? "OK" : e.matched === "disputed" ? "Strittig" : "Ausgebucht"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{e.match_note ?? ""}</td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => handleEntryUpdate(e.id, "matched")} title="Als bezahlt markieren"
                          className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100">✓ OK</button>
                        <button onClick={() => handleEntryUpdate(e.id, "disputed")} title="Als strittig markieren"
                          className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100">⚡ Strittig</button>
                        <button onClick={() => handleEntryUpdate(e.id, "written_off")} title="Ausbuchen"
                          className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-100">✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button onClick={() => handleDelete(selectedDoc.id)} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100">Dokument löschen</button>
          </div>
        </div>
      )}

      {/* ═══ SEARCH RESULTS ═══ */}
      {view === "search" && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Suchergebnisse für &ldquo;{searchQuery}&rdquo;</h2>
          {searchResults.length === 0 ? (
            <p className="text-sm text-slate-500">Keine Einträge gefunden.</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Rechnungs-Nr.</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-600">Betrag</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Dokument</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Briefdatum</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 cursor-pointer"
                      onClick={() => { if (r.document) openDetail(r.document.id); }}>
                      <td className="px-4 py-2.5 font-mono font-medium text-slate-900">{r.invoice_no}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmtEur(r.amount_eur)}</td>
                      <td className="px-4 py-2.5 text-slate-600">{r.document?.filename ?? "—"}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.document?.letter_date ?? "—"}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-block rounded-lg px-2 py-0.5 text-xs font-medium ${ENTRY_STATUS_CLS[r.matched] ?? "bg-slate-100"}`}>
                          {r.matched === "unmatched" ? "Offen" : r.matched === "matched" ? "OK" : r.matched}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={`text-2xl font-bold ${accent ?? "text-slate-900"}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}
