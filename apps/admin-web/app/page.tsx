"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import LoginForm from "@/components/login-form";
import {
  ActivityFeedItem,
  SignatureEvent,
  User,
  getActivityFeed,
  getMe,
  getSignatures,
  getUsers,
  logout,
} from "@/lib/api";

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

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  leistungsnachweis: "Leistungsnachweis",
  vp_antrag: "VP-Antrag",
  pflegeumwandlung: "Pflegeumwandlung",
};

export default function AdminDashboardPage() {
  const [booting, setBooting] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [usersCount, setUsersCount] = useState(0);
  const [signatures, setSignatures] = useState<SignatureEvent[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityFeedItem[]>([]);
  const [pageError, setPageError] = useState("");

  const signatureCount = signatures.length;
  const latestSignature = signatures[0] ?? null;

  const signaturesByType = useMemo(() => {
    return {
      leistungsnachweis: signatures.filter(
        (item) => item.document_type === "leistungsnachweis"
      ).length,
      vp_antrag: signatures.filter(
        (item) => item.document_type === "vp_antrag"
      ).length,
      pflegeumwandlung: signatures.filter(
        (item) => item.document_type === "pflegeumwandlung"
      ).length,
    };
  }, [signatures]);

  const loadDashboard = useCallback(async () => {
    setPageError("");

    try {
      const [users, signatureData, feedData] = await Promise.all([
        getUsers(),
        getSignatures(),
        getActivityFeed(),
      ]);

      setUsersCount(users.length);
      setSignatures(signatureData);
      setActivityFeed(feedData);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Fehler beim Laden des Dashboards"
      );
    }
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const me = await getMe();
      setCurrentUser(me);
      setIsAuthenticated(true);

      if (me.role === "admin") {
        await loadDashboard();
      }
    } catch {
      setIsAuthenticated(false);
      setCurrentUser(null);
    } finally {
      setBooting(false);
    }
  }, [loadDashboard]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  async function handleLogout() {
    await logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setUsersCount(0);
    setSignatures([]);
    setActivityFeed([]);
  }

  async function handleLoginSuccess(user: User) {
    setCurrentUser(user);
    setIsAuthenticated(true);

    if (user.role === "admin") {
      await loadDashboard();
    }
  }

  if (booting) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-slate-600">Lade Dashboard...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            FrohZeitRakete
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">Admin Login</h1>
          <p className="mt-3 text-slate-600">
            Dashboard mit Usern, Signaturen und Aktivitätsfeed.
          </p>
        </div>

        <LoginForm onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  if (currentUser?.role !== "admin") {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Keine Admin-Rechte</h1>
        <p className="mt-2 text-slate-600">
          Du bist eingeloggt, aber hast keine Berechtigung für das Dashboard.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            Staging aktiv
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-2 text-slate-600">
            Überblick über User, Signaturen und letzte Aktivitäten.
          </p>
          {currentUser ? (
            <p className="mt-2 text-sm text-slate-500">
              Eingeloggt als {currentUser.full_name} ({currentUser.email})
            </p>
          ) : null}
        </div>

        <div className="flex gap-3">
          <button
            onClick={loadDashboard}
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
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {pageError}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">User gesamt</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{usersCount}</p>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Signaturen gesamt</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{signatureCount}</p>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Leistungsnachweise</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {signaturesByType.leistungsnachweis}
          </p>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">VP / Pflegeumwandlung</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {signaturesByType.vp_antrag + signaturesByType.pflegeumwandlung}
          </p>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Letzte Unterschriften</h2>
          <p className="mt-1 text-sm text-slate-500">
            Die neuesten erfassten Signaturen im System
          </p>

          <div className="mt-5 space-y-3">
            {signatures.length === 0 ? (
              <p className="text-slate-600">Noch keine Signaturen vorhanden.</p>
            ) : (
              signatures.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-slate-900">
                      {DOCUMENT_TYPE_LABELS[item.document_type] ?? item.document_type}
                    </p>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-700">
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Patient #{item.patient_id} · {item.signer_name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDate(item.signed_at)} · Quelle: {item.source}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Aktivität der letzten Stunden</h2>
          <p className="mt-1 text-sm text-slate-500">
            Log-/Chat-artige Übersicht für neue Vorgänge
          </p>

          <div className="mt-5 space-y-3">
            {activityFeed.length === 0 ? (
              <p className="text-slate-600">Noch keine Aktivität vorhanden.</p>
            ) : (
              activityFeed.slice(0, 10).map((item) => (
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

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Zuletzt erfasste Signatur</h2>

        {!latestSignature ? (
          <p className="mt-3 text-slate-600">Noch keine Signatur vorhanden.</p>
        ) : (
          <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 text-sm font-medium text-slate-700">SVG-Vorschau</div>
              {latestSignature.asset?.svg_content ? (
                <div
                  className="flex min-h-[220px] items-center justify-center rounded-xl bg-slate-50 p-4"
                  dangerouslySetInnerHTML={{
                    __html: latestSignature.asset.svg_content,
                  }}
                />
              ) : (
                <p className="text-sm text-slate-500">Keine SVG vorhanden.</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="font-medium text-slate-700">Dokumenttyp</dt>
                  <dd className="text-slate-600">
                    {DOCUMENT_TYPE_LABELS[latestSignature.document_type] ??
                      latestSignature.document_type}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Patient ID</dt>
                  <dd className="text-slate-600">{latestSignature.patient_id}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Unterzeichner</dt>
                  <dd className="text-slate-600">{latestSignature.signer_name}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Zeitpunkt</dt>
                  <dd className="text-slate-600">{formatDate(latestSignature.signed_at)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Status</dt>
                  <dd className="text-slate-600">{latestSignature.status}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Quelle</dt>
                  <dd className="text-slate-600">{latestSignature.source}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}