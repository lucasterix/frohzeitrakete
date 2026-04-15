"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, getMe } from "@/lib/api";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1cnudUmnU2XWuO1emlUiEWpNv7mdIGiySmWsG0mEzXhU/edit?usp=sharing";

const EMBED_URL =
  "https://docs.google.com/spreadsheets/d/1cnudUmnU2XWuO1emlUiEWpNv7mdIGiySmWsG0mEzXhU/edit?usp=sharing&widget=true&rm=minimal";

export default function VertretungenPage() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);

  const bootstrap = useCallback(async () => {
    try {
      const me: User = await getMe();
      if (me.role !== "admin" && me.role !== "buero") {
        router.replace("/user");
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

  if (booting) {
    return <div className="h-64 animate-pulse rounded-3xl bg-white/60" />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Team
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              Vertretungen
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Google-Sheet mit den Antworten aus dem Vertretungs-Formular.
              Zum Bearbeiten mit dem eigenen Google-Account anmelden.
            </p>
          </div>
          <a
            href={SHEET_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
          >
            In Google Sheets öffnen ↗
          </a>
        </div>
      </div>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <iframe
          src={EMBED_URL}
          className="h-[75vh] w-full border-0"
          title="Vertretungsplan"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-storage-access-by-user-activation allow-popups-to-escape-sandbox"
          allow="clipboard-read; clipboard-write"
        />
      </section>

      <p className="text-xs text-slate-500">
        Hinweis: Wenn die Tabelle hier nicht geladen wird, liegt das meist
        an den Third-Party-Cookie-Settings deines Browsers. Nutze in dem
        Fall den Button oben rechts &quot;In Google Sheets öffnen&quot; —
        das öffnet die Datei in einem neuen Tab mit deinem Google-Login.
      </p>
    </div>
  );
}
