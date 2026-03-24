"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PatientList from "@/components/patient-list";
import MySessionList from "@/components/my-session-list";
import { User, getMe, logout } from "@/lib/api";

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
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-slate-600">Lade User-Bereich...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              User-Bereich
            </div>

            <h1 className="mt-3 text-3xl font-bold tracking-tight">
              Willkommen
            </h1>

            <p className="mt-2 text-slate-600">
              Übersicht über deine Daten, Patienten und Sessions.
            </p>

            {currentUser ? (
              <p className="mt-2 text-sm text-slate-500">
                Eingeloggt als {currentUser.full_name} ({currentUser.email})
              </p>
            ) : null}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => router.push("/")}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Home
            </button>

            <button
              onClick={handleLogout}
              className="rounded-xl bg-slate-900 px-4 py-3 font-medium text-white transition hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </div>

        {currentUser?.patti_person_id ? (
          <PatientList />
        ) : (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Meine Patienten</h2>
            <p className="mt-2 text-slate-600">
              Für diesen User ist keine Patti Person ID hinterlegt.
            </p>
          </section>
        )}

        <MySessionList />
      </div>
    </main>
  );
}