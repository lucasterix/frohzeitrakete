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
        (s) => s.document_type === "leistungsnachweis"
      ).length,

      vp_antrag: signatures.filter(
        (s) => s.document_type === "vp_antrag"
      ).length,

      pflegeumwandlung: signatures.filter(
        (s) => s.document_type === "pflegeumwandlung"
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
        error instanceof Error
          ? error.message
          : "Fehler beim Laden des Dashboards"
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
        Lade Dashboard...
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

          <h1 className="mt-4 text-3xl font-bold">
            Admin Login
          </h1>

          <p className="mt-3 text-slate-600">
            Dashboard für User, Signaturen und Aktivitätsfeed.
          </p>
        </div>

        <LoginForm onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  if (currentUser?.role !== "admin") {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">
          Keine Admin-Rechte
        </h1>

        <p className="mt-2 text-slate-600">
          Du bist eingeloggt, aber hast keine Berechtigung.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">

      {/* HEADER */}

      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">

        <div>

          <div className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            staging aktiv
          </div>

          <h1 className="mt-3 text-3xl font-bold">
            Dashboard
          </h1>

          <p className="mt-2 text-slate-600">
            Übersicht über User und Unterschriften.
          </p>

          {currentUser && (
            <p className="mt-2 text-sm text-slate-500">
              {currentUser.full_name} · {currentUser.email}
            </p>
          )}

        </div>

        <div className="flex gap-3">

          <button
            onClick={loadDashboard}
            className="rounded-xl border border-slate-300 px-4 py-2"
          >
            aktualisieren
          </button>

          <button
            onClick={handleLogout}
            className="rounded-xl bg-slate-900 px-4 py-2 text-white"
          >
            logout
          </button>

        </div>

      </div>


      {pageError && (
        <div className="rounded-xl bg-red-50 p-3 text-red-700">
          {pageError}
        </div>
      )}


      {/* STATS */}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">

        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            User
          </p>

          <p className="mt-2 text-3xl font-bold">
            {usersCount}
          </p>
        </div>


        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Signaturen gesamt
          </p>

          <p className="mt-2 text-3xl font-bold">
            {signatureCount}
          </p>
        </div>


        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Leistungsnachweis
          </p>

          <p className="mt-2 text-3xl font-bold">
            {signaturesByType.leistungsnachweis}
          </p>
        </div>


        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            VP + Pflegeumwandlung
          </p>

          <p className="mt-2 text-3xl font-bold">
            {signaturesByType.vp_antrag + signaturesByType.pflegeumwandlung}
          </p>
        </div>

      </div>



      {/* LISTE */}

      <div className="grid gap-6 xl:grid-cols-2">

        {/* letzte signaturen */}

        <section className="rounded-3xl border bg-white p-6 shadow-sm">

          <h2 className="text-xl font-semibold">
            letzte unterschriften
          </h2>

          <div className="mt-4 space-y-3">

            {signatures.slice(0, 8).map((s) => (

              <div
                key={s.id}
                className="rounded-xl border bg-slate-50 p-3"
              >

                <div className="flex justify-between">

                  <strong>
                    {DOCUMENT_TYPE_LABELS[s.document_type]}
                  </strong>

                  <span className="text-xs">
                    {s.status}
                  </span>

                </div>

                <div className="text-sm text-slate-600">
                  patient #{s.patient_id}
                </div>

                <div className="text-xs text-slate-500">
                  {formatDate(s.signed_at)}
                </div>

              </div>

            ))}

          </div>

        </section>


        {/* activity feed */}

        <section className="rounded-3xl border bg-white p-6 shadow-sm">

          <h2 className="text-xl font-semibold">
            aktivität
          </h2>

          <div className="mt-4 space-y-3">

            {activityFeed.slice(0, 10).map((item) => (

              <div
                key={item.id}
                className="rounded-xl border bg-slate-50 p-3"
              >

                <div className="flex justify-between">

                  <strong>
                    {item.title}
                  </strong>

                  <span className="text-xs">
                    {formatDate(item.created_at)}
                  </span>

                </div>

                <div className="text-sm text-slate-600">
                  {item.subtitle}
                </div>

              </div>

            ))}

          </div>

        </section>

      </div>



      {/* letzte signatur preview */}

      {latestSignature && latestSignature.asset?.svg_content && (

        <section className="rounded-3xl border bg-white p-6 shadow-sm">

          <h2 className="text-xl font-semibold">
            letzte signatur preview
          </h2>

          <div
            className="mt-4 flex justify-center rounded-xl bg-slate-50 p-6"
            dangerouslySetInnerHTML={{
              __html: latestSignature.asset.svg_content,
            }}
          />

        </section>

      )}

    </div>
  );
}