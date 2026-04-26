"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityFeedItem,
  CreateTestSignaturePayload,
  SignatureEvent,
  createTestSignature,
  getActivityFeed,
  getSignatures,
} from "@/lib/api";
import { useRequireAdmin } from "@/lib/use-require-role";
import {
  ActivityIcon,
  AlertCircleIcon,
  RefreshIcon,
  SignatureIcon,
  SparkleIcon,
} from "@/components/icons";

const DEFAULT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 160">
  <path d="M20 110 C60 20, 120 20, 160 95 S260 150, 320 70"
        fill="none"
        stroke="black"
        stroke-width="4"
        stroke-linecap="round"
        stroke-linejoin="round" />
</svg>`;

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  leistungsnachweis: "Leistungsnachweis",
  vp_antrag: "VP-Antrag",
  pflegeumwandlung: "Pflegeumwandlung",
};

const DOCUMENT_TYPE_COLORS: Record<string, string> = {
  leistungsnachweis: "bg-brand-500",
  vp_antrag: "bg-emerald-500",
  pflegeumwandlung: "bg-amber-500",
};

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function AdminSignaturesPage() {
  const { authorized } = useRequireAdmin();
  const [refreshing, setRefreshing] = useState(false);

  const [signatures, setSignatures] = useState<SignatureEvent[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityFeedItem[]>([]);
  const [selectedSignatureId, setSelectedSignatureId] = useState<number | null>(
    null
  );
  const [filterType, setFilterType] = useState<"all" | string>("all");

  const [pageError, setPageError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [patientId, setPatientId] = useState("12345");
  const [documentType, setDocumentType] = useState<
    CreateTestSignaturePayload["document_type"]
  >("leistungsnachweis");
  const [signerName, setSignerName] = useState("Max Mustermann");
  const [infoTextVersion, setInfoTextVersion] = useState("v1");
  const [note, setNote] = useState("manueller Test");
  const [svgContent, setSvgContent] = useState(DEFAULT_SVG);

  const filteredSignatures = useMemo(() => {
    if (filterType === "all") return signatures;
    return signatures.filter((s) => s.document_type === filterType);
  }, [signatures, filterType]);

  const selectedSignature = useMemo(
    () =>
      signatures.find((item) => item.id === selectedSignatureId) ??
      filteredSignatures[0] ??
      null,
    [signatures, filteredSignatures, selectedSignatureId]
  );

  const loadData = useCallback(async () => {
    setRefreshing(true);
    setPageError("");

    try {
      const [signatureData, feedData] = await Promise.all([
        getSignatures(),
        getActivityFeed(),
      ]);

      setSignatures(signatureData);
      setActivityFeed(feedData);

      if (signatureData.length > 0 && selectedSignatureId == null) {
        setSelectedSignatureId(signatureData[0].id);
      }
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Fehler beim Laden der Signaturdaten"
      );
    } finally {
      setRefreshing(false);
    }
  }, [selectedSignatureId]);

  useEffect(() => {
    if (authorized) loadData();
  }, [authorized, loadData]);

  async function handleCreateSignature(event: React.FormEvent) {
    event.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");

    try {
      const created = await createTestSignature({
        patient_id: Number(patientId),
        document_type: documentType,
        signer_name: signerName,
        info_text_version: infoTextVersion || null,
        svg_content: svgContent,
        width: 400,
        height: 160,
        note: note || null,
      });

      setSubmitSuccess(`Test-Signatur #${created.id} gespeichert.`);
      await loadData();
      setSelectedSignatureId(created.id);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Fehler beim Speichern der Signatur"
      );
    }
  }

  if (!authorized) {
    return (
      <div className="space-y-6">
        <div className="h-32 animate-pulse rounded-3xl bg-white/60" />
        <div className="h-96 animate-pulse rounded-3xl bg-white/60" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Dokumente
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              Signaturen
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {filteredSignatures.length} von {signatures.length} Signaturen ·
              SVG-Vorschau und Activity-Feed.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowCreateForm((v) => !v)}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-brand-900/20 transition hover:bg-brand-700"
            >
              <SparkleIcon className="h-4 w-4" />
              {showCreateForm ? "Formular schließen" : "Test-Signatur"}
            </button>
            <button
              onClick={loadData}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshIcon
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              Aktualisieren
            </button>
          </div>
        </div>
      </div>

      {pageError && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircleIcon className="h-5 w-5 shrink-0" />
          {pageError}
        </div>
      )}

      {showCreateForm && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Test-Signatur erfassen
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Simuliert den Mobile-Flow für QA-Zwecke.
          </p>

          <form
            onSubmit={handleCreateSignature}
            className="mt-5 grid gap-4 lg:grid-cols-2"
          >
            <FormField label="Patient ID">
              <input
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="form-input"
              />
            </FormField>
            <FormField label="Dokumenttyp">
              <select
                value={documentType}
                onChange={(e) =>
                  setDocumentType(
                    e.target.value as CreateTestSignaturePayload["document_type"]
                  )
                }
                className="form-input"
              >
                <option value="leistungsnachweis">Leistungsnachweis</option>
                <option value="vp_antrag">VP-Antrag</option>
                <option value="pflegeumwandlung">Pflegeumwandlung</option>
              </select>
            </FormField>
            <FormField label="Unterzeichner">
              <input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="form-input"
              />
            </FormField>
            <FormField label="Info-Text-Version">
              <input
                value={infoTextVersion}
                onChange={(e) => setInfoTextVersion(e.target.value)}
                className="form-input"
              />
            </FormField>
            <FormField label="Notiz" full>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="form-input"
              />
            </FormField>
            <FormField label="SVG-Inhalt" full>
              <textarea
                value={svgContent}
                onChange={(e) => setSvgContent(e.target.value)}
                rows={8}
                className="form-input font-mono text-xs"
              />
            </FormField>

            {submitError && (
              <div className="lg:col-span-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {submitError}
              </div>
            )}
            {submitSuccess && (
              <div className="lg:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {submitSuccess}
              </div>
            )}

            <button
              type="submit"
              className="lg:col-span-2 inline-flex items-center justify-center rounded-2xl bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm shadow-brand-900/20 transition hover:bg-brand-700"
            >
              Test-Signatur speichern
            </button>
          </form>
        </section>
      )}

      {/* Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterPill
          active={filterType === "all"}
          onClick={() => setFilterType("all")}
          label="Alle"
          count={signatures.length}
        />
        {(["leistungsnachweis", "vp_antrag", "pflegeumwandlung"] as const).map(
          (type) => (
            <FilterPill
              key={type}
              active={filterType === type}
              onClick={() => setFilterType(type)}
              label={DOCUMENT_TYPE_LABELS[type]}
              count={signatures.filter((s) => s.document_type === type).length}
              dotColor={DOCUMENT_TYPE_COLORS[type]}
            />
          )
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              Signaturen ({filteredSignatures.length})
            </h2>
          </div>

          {filteredSignatures.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
              <SignatureIcon className="mb-2 h-8 w-8" />
              Keine Signaturen für diesen Filter.
            </div>
          ) : (
            <div className="max-h-[600px] space-y-2 overflow-y-auto pr-1">
              {filteredSignatures.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSignatureId(s.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                    selectedSignature?.id === s.id
                      ? "border-brand-300 bg-brand-50/50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white ${
                      DOCUMENT_TYPE_COLORS[s.document_type] ?? "bg-slate-500"
                    }`}
                  >
                    <SignatureIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {DOCUMENT_TYPE_LABELS[s.document_type] ??
                          s.document_type}
                      </p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-600">
                        {s.source}
                      </span>
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      Patient #{s.patient_id} · {s.signer_name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {formatDate(s.signed_at)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Signatur-Details
          </h2>

          {!selectedSignature ? (
            <p className="mt-3 text-sm text-slate-500">
              Wähle links eine Signatur aus, um die SVG zu sehen.
            </p>
          ) : (
            <div className="mt-4 space-y-5">
              <div className="grid place-items-center rounded-2xl bg-gradient-to-br from-slate-50 to-brand-50/40 p-6">
                {selectedSignature.asset?.svg_content ? (
                  <div
                    className="w-full max-w-[450px] [&>svg]:h-auto [&>svg]:w-full"
                    dangerouslySetInnerHTML={{
                      __html: selectedSignature.asset.svg_content,
                    }}
                  />
                ) : (
                  <p className="text-sm text-slate-400">Keine SVG vorhanden.</p>
                )}
              </div>

              <dl className="grid gap-3 sm:grid-cols-2">
                <DetailRow
                  label="Dokumenttyp"
                  value={
                    DOCUMENT_TYPE_LABELS[selectedSignature.document_type] ??
                    selectedSignature.document_type
                  }
                />
                <DetailRow
                  label="Patient ID"
                  value={`#${selectedSignature.patient_id}`}
                />
                <DetailRow
                  label="Unterzeichner"
                  value={selectedSignature.signer_name}
                />
                <DetailRow label="Status" value={selectedSignature.status} />
                <DetailRow label="Quelle" value={selectedSignature.source} />
                <DetailRow
                  label="Info-Version"
                  value={selectedSignature.info_text_version ?? "—"}
                />
                <DetailRow
                  label="Unterschrieben"
                  value={formatDate(selectedSignature.signed_at)}
                />
                <DetailRow
                  label="Notiz"
                  value={selectedSignature.note ?? "—"}
                />
              </dl>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Activity Feed
            </h2>
            <p className="text-sm text-slate-500">
              die letzten {activityFeed.length} Events
            </p>
          </div>
          <ActivityIcon className="h-4 w-4 text-slate-400" />
        </div>

        {activityFeed.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-400">
            Noch keine Aktivität.
          </div>
        ) : (
          <ol className="relative space-y-4 border-l-2 border-slate-100 pl-5">
            {activityFeed.map((item) => (
              <li key={item.id} className="relative">
                <span className="absolute -left-[27px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-brand-500 ring-1 ring-brand-200" />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {item.title}
                    </p>
                    <p className="text-xs text-slate-500">{item.subtitle}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {formatDate(item.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Tailwind utility class for shared form-input look */}
      <style>{`
        .form-input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid #e2e8f0;
          background: rgba(248, 250, 252, 0.5);
          padding: 0.625rem 1rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s, background 0.15s;
        }
        .form-input:focus {
          border-color: #a78bfa;
          background: white;
        }
      `}</style>
    </div>
  );
}

function FormField({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "lg:col-span-2" : ""}`}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  count,
  dotColor,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  dotColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-slate-900 text-white shadow-sm"
          : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
    >
      {dotColor && (
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      )}
      {label}
      <span
        className={`rounded-full px-1.5 text-xs font-semibold tabular-nums ${
          active ? "bg-white/20" : "bg-slate-100 text-slate-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50/70 px-3 py-2.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-700">{value}</dd>
    </div>
  );
}
