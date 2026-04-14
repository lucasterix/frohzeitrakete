"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PatientList from "@/components/patient-list";
import MySessionList from "@/components/my-session-list";
import ChangePasswordForm from "@/components/change-password-form";
import { User, getMe, logout } from "@/lib/api";
import { LogoutIcon, RocketIcon, UserCircleIcon } from "@/components/icons";

export default function UserPage() {
  const router = useRouter();

  const [booting, setBooting] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const bootstrap = useCallback(async () => {
    try {
      const me = await getMe();
      setCurrentUser(me);

      if (me.role === "admin") {
        router.replace("/admin");
        return;
      }
    } catch {
      router.replace("/");
      return;
    } finally {
      setBooting(false);
    }
  }, [router]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  async function handleLogout() {
    await logout();
    router.replace("/");
  }

  if (booting) {
    return (
      <main className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-50 via-white to-brand-50/40 text-sm text-slate-500">
        Lade Bereich …
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand-50/40 px-4 py-8 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-bold text-white shadow-lg shadow-brand-900/30">
                {currentUser?.full_name?.charAt(0).toUpperCase() ?? "?"}
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">
                  <RocketIcon className="h-3 w-3" />
                  FrohZeitRakete
                </div>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                  Hallo {currentUser?.full_name?.split(" ")[0] ?? ""}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Übersicht über Patienten, Sessions und Profil-Einstellungen.
                </p>
                {currentUser && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <UserCircleIcon className="h-3.5 w-3.5" />
                    {currentUser.email}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 self-start rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <LogoutIcon className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>

        {currentUser?.patti_person_id ? (
          <PatientList />
        ) : (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              Meine Patienten
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Für diesen Account ist keine Patti-Person-ID hinterlegt. Bitte den
              Admin um Zuweisung.
            </p>
          </section>
        )}

        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <ChangePasswordForm />
          <MySessionList />
        </div>
      </div>
    </main>
  );
}
