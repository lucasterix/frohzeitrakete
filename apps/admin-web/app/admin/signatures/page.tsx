"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import LoginForm from "@/components/login-form";
import {
  ActivityFeedItem,
  CreateTestSignaturePayload,
  SignatureEvent,
  User,
  createTestSignature,
  getActivityFeed,
  getMe,
  getSignatures,
  logout,
} from "@/lib/api";

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
  const [booting, setBooting] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [signatures, setSignatures] = useState<SignatureEvent[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityFeedItem[]>([]);
  const [selectedSignatureId, setSelectedSignatureId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const [patientId, setPatientId] = useState("12345");
  const [documentType, setDocumentType] =
    useState<CreateTestSignaturePayload["document_type"]>("leistungsnachweis");
  const [signerName, setSignerName] = useState("Max Mustermann");
  const [infoTextVersion, setInfoTextVersion] = useState("v1");
  const [note, setNote] = useState("manueller Test");
  const [svgContent, setSvgContent] = useState(DEFAULT_SVG);

  const selectedSignature = useMemo(
    () => signatures.find((item) => item.id === selectedSignatureId) ?? signatures[0] ?? null,
    [signatures, selectedSignatureId]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
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
        error instanceof Error ? error.message : "Fehler beim Laden der Signaturdaten"
      );
    } finally {
      setLoading(false);
    }
  }, [selectedSignatureId]);

  const bootstrap = useCallback(async () => {
    try {
      const me = await getMe();
      setCurrentUser(me);
      setIsAuthenticated(true);

      if (me.role === "admin") {
        await loadData();
      }
    } catch {
      setIsAuthenticated(false);
      setCurrentUser(null);
    } finally {
      setBooting(false);
    }
  }, [loadData]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  async function handleLogout() {
    await logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setSignatures([]);
    setActivityFeed([]);
  }

  async function handleLoginSuccess(user: User) {
    setCurrentUser(user);
    setIsAuthenticated(true);

    if (user.role === "admin") {
      await loadData();
    }
  }

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
        error instanceof Error ? error.message : "Fehler beim Speichern der Signatur"
      );
    }
  }

  if (booting) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-slate-600">Lade Anwendung...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              FrohZeitRakete
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight">Admin Login</h1>
            <p className="mt-3 text-slate-600">
              Signaturen, Aktivitätsfeed und spätere App-Anbindung laufen über dieselbe API.
            </p>
          </div>

          <LoginForm onLoginSuccess={handleLoginSuccess} />
        </div>
      </main>
    );
  }

  if (currentUser?.role !== "admin") {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold">Keine Admin-Rechte</h1>
          <p className="mt-2 text-slate-600">
            Du bist eingeloggt, aber hast keine Berechtigung für die Signaturverwaltung.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
              Signatur-Workflow Staging
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">Admin – Signaturen</h1>
            <p className="mt-2 text-slate-600">
              Test-SVGs speichern, letzte Unterschriften prüfen und Feed für die App vorbereiten.
            </p>
            {currentUser ? (
              <p className="mt-2 text-sm text-slate-500">
                Eingeloggt als {currentUser.full_name} ({currentUser.email})
              </p>
            ) : null}
          </div>

          <div className="flex gap-3">
            <button
              onClick={loadData}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Neu laden
            </button>
            <button
              onClick={handleLogout}
              className="rounded-xl bg-slate-900 px-4 py-3 font-medium text-white transition hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </div>

        {pageError ? (
          <div className="mb-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Test-Signatur erfassen</h2>
            <p className="mt-2 text-sm text-slate-500">
              Damit simulierst du später den Mobile-Flow, bis das App-Frontend fertig ist.
            </p>

            <form onSubmit={handleCreateSignature} className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Patient ID
                </label>
                <input
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-500"
                  placeholder="12345"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Dokumenttyp
                </label>
                <select
                  value={documentType}
                  onChange={(e) =>
                    setDocumentType(e.target.value as CreateTestSignaturePayload["document_type"])
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-500"
                >
                  <option value="leistungsnachweis">Leistungsnachweis</option>
                  <option value="vp_antrag">VP-Antrag</option>
                  <option value="pflegeumwandlung">Pflegeumwandlung</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Unterzeichner
                </label>
                <input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Info-Text-Version
                </label>
                <input
                  value={infoTextVersion}
                  onChange={(e) => setInfoTextVersion(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Notiz
                </label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  SVG-Inhalt
                </label>
                <textarea
                  value={svgContent}
                  onChange={(e) => setSvgContent(e.target.value)}
                  rows={10}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-xs outline-none transition focus:border-slate-500"
                />
              </div>

              {submitError ? (
                <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                  {submitError}
                </div>
              ) : null}

              {submitSuccess ? (
                <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {submitSuccess}
                </div>
              ) : null}

              <button
                type="submit"
                className="w-full rounded-xl bg-slate-900 px-4 py-3 font-medium text-white transition hover:bg-slate-800"
              >
                Test-Signatur speichern
              </button>
            </form>
          </section>

          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Letzte Unterschriften</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Übersicht der zuletzt erfassten Signaturen
                  </p>
                </div>
                {loading ? <p className="text-sm text-slate-500">Lade...</p> : null}
              </div>

              {signatures.length === 0 ? (
                <p className="text-slate-600">Noch keine Signaturen vorhanden.</p>
              ) : (
                <div className="grid gap-3">
                  {signatures.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedSignatureId(item.id)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        selectedSignature?.id === item.id
                          ? "border-slate-900 bg-slate-50"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-slate-900">
                          {DOCUMENT_TYPE_LABELS[item.document_type] ?? item.document_type}
                        </p>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                          {item.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        Patient #{item.patient_id} · {item.signer_name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(item.signed_at)} · Quelle: {item.source}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Signatur-Details</h2>

              {!selectedSignature ? (
                <p className="mt-3 text-slate-600">Keine Signatur ausgewählt.</p>
              ) : (
                <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px]">
                  <div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="mb-3 text-sm font-medium text-slate-700">SVG-Vorschau</div>
                      {selectedSignature.asset?.svg_content ? (
                        <div
                          className="flex min-h-[220px] items-center justify-center rounded-xl bg-slate-50 p-4"
                          dangerouslySetInnerHTML={{
                            __html: selectedSignature.asset.svg_content,
                          }}
                        />
                      ) : (
                        <p className="text-sm text-slate-500">Keine SVG vorhanden.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <dl className="space-y-3 text-sm">
                      <div>
                        <dt className="font-medium text-slate-700">Dokumenttyp</dt>
                        <dd className="text-slate-600">
                          {DOCUMENT_TYPE_LABELS[selectedSignature.document_type] ??
                            selectedSignature.document_type}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-700">Patient ID</dt>
                        <dd className="text-slate-600">{selectedSignature.patient_id}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-700">Unterzeichner</dt>
                        <dd className="text-slate-600">{selectedSignature.signer_name}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-700">Status</dt>
                        <dd className="text-slate-600">{selectedSignature.status}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-700">Quelle</dt>
                        <dd className="text-slate-600">{selectedSignature.source}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-700">Info-Text-Version</dt>
                        <dd className="text-slate-600">
                          {selectedSignature.info_text_version ?? "-"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-700">Zeitpunkt</dt>
                        <dd className="text-slate-600">
                          {formatDate(selectedSignature.signed_at)}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-700">Notiz</dt>
                        <dd className="text-slate-600">{selectedSignature.note ?? "-"}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Aktivität der letzten Stunden</h2>
              <p className="mt-1 text-sm text-slate-500">
                Vorbereitung für den späteren Log-/Chat-Bereich im Admin-Web
              </p>

              <div className="mt-5 space-y-3">
                {activityFeed.length === 0 ? (
                  <p className="text-slate-600">Noch keine Aktivität vorhanden.</p>
                ) : (
                  activityFeed.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-slate-900">{item.title}</p>
                        <span className="text-xs text-slate-500">
                          {formatDate(item.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{item.subtitle}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}