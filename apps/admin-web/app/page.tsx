"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LoginForm from "@/components/login-form";
import { User, getMe } from "@/lib/api";

function getTargetRoute(user: User): string {
  return user.role === "admin" ? "/admin" : "/user";
}

export default function HomePage() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);

  const bootstrap = useCallback(async () => {
    try {
      const me = await getMe();
      router.replace(getTargetRoute(me));
      return;
    } catch {
      // nicht eingeloggt -> auf Home bleiben
    } finally {
      setBooting(false);
    }
  }, [router]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  async function handleLoginSuccess(user: User) {
    router.replace(getTargetRoute(user));
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

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            FrohZeitRakete
          </div>

          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            Willkommen
          </h1>

          <p className="mt-3 text-slate-600">
            Zentrale Startseite mit Login. Nach dem Einloggen wirst du
            automatisch in den passenden Bereich weitergeleitet.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-5">
              <h2 className="text-lg font-semibold">Für Admins</h2>
              <p className="mt-2 text-sm text-slate-600">
                Dashboard, Userverwaltung, Signaturen und Aktivitätsfeed.
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-5">
              <h2 className="text-lg font-semibold">Für User</h2>
              <p className="mt-2 text-sm text-slate-600">
                Eigene Patienten, Profildaten und aktuelle Sessions.
              </p>
            </div>
          </div>
        </section>

        <LoginForm onLoginSuccess={handleLoginSuccess} />
      </div>
    </main>
  );
}