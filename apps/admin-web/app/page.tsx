"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LoginForm from "@/components/login-form";
import { User, getMe } from "@/lib/api";
import { RocketIcon, ShieldIcon, SignatureIcon, UsersIcon } from "@/components/icons";

function getTargetRoute(user: User): string {
  if (user.role === "admin") return "/admin";
  if (user.role === "buero") return "/admin/tasks";
  return "/user";
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
      // nicht eingeloggt -> auf der Landingpage bleiben
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
      <main className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-50 via-white to-brand-50/40">
        <div className="flex items-center gap-3 text-slate-500">
          <span className="h-2 w-2 animate-ping rounded-full bg-brand-500" />
          Lade Anwendung …
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-brand-50/40">
      {/* Background blob */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-brand-200/40 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-emerald-200/30 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-8 px-4 py-10 sm:px-6 sm:py-16 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
        <section className="text-center lg:text-left">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50/70 px-4 py-1.5 text-xs font-semibold text-brand-800 backdrop-blur sm:mb-6">
            <RocketIcon className="h-3.5 w-3.5 text-brand-600" />
            FrohZeitRakete
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Pflege.{" "}
            <span className="bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-transparent">
              Digital.
            </span>
            <br />
            Auf Knopfdruck.
          </h1>

          <p className="mx-auto mt-4 max-w-lg text-sm text-slate-600 sm:mt-5 sm:text-lg lg:mx-0">
            Die FrohZeit Rakete für Fröhlich Dienste — Einsätze erfassen,
            Stunden im Blick, Urlaub beantragen.
          </p>

          <div className="mt-6 hidden gap-4 sm:grid sm:grid-cols-3 lg:mt-10">
            <Feature Icon={UsersIcon} title="Patienten" body="Übersicht mit Reststunden" />
            <Feature Icon={SignatureIcon} title="Zeiterfassung" body="Einsätze + Unterschrift digital" />
            <Feature Icon={ShieldIcon} title="Sicher" body="Verschlüsselt und DSGVO-konform" />
          </div>
        </section>

        <div className="w-full max-w-md lg:max-w-none">
          <LoginForm onLoginSuccess={handleLoginSuccess} />
        </div>
      </div>
    </main>
  );
}

function Feature({
  Icon,
  title,
  body,
}: {
  Icon: (props: React.SVGProps<SVGSVGElement>) => JSX.Element;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 backdrop-blur">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-0.5 text-xs text-slate-500">{body}</p>
    </div>
  );
}
