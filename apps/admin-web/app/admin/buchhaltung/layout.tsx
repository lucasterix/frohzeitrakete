"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { getMe, User } from "@/lib/api";

const TABS = [
  { href: "/admin/buchhaltung/bank-transaktionen", label: "Bank-Transaktionen" },
  { href: "/admin/buchhaltung/buchungen", label: "Buchungen" },
  { href: "/admin/buchhaltung/mitarbeiter", label: "Mitarbeiter & Lohn" },
  { href: "/admin/buchhaltung/bescheinigungen", label: "Bescheinigungen" },
  { href: "/admin/buchhaltung/monatsabschluss", label: "Monatsabschluss" },
];

const ALLOWED_ROLES = new Set(["admin", "buchhaltung"]);

export default function BuchhaltungLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me: User) => {
        if (cancelled) return;
        if (ALLOWED_ROLES.has(me.role)) {
          setAuthorized(true);
        } else {
          router.replace("/user");
        }
      })
      .catch(() => {
        if (!cancelled) router.replace("/");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (authorized !== true) {
    return (
      <div className="space-y-6">
        <div className="h-10 animate-pulse rounded-2xl bg-white/60" />
        <div className="h-64 animate-pulse rounded-3xl bg-white/60" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Buchhaltung
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              DATEV-Buchungstool — Bank, Buchungen, Lohn &amp; Gehalt, Bescheinigungen, Monatsabschluss.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
            Phase 0 · leere Module, Umsetzung folgt
          </span>
        </div>

        <nav className="mt-6 flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const isActive = pathname === tab.href || pathname?.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={
                  "rounded-xl px-4 py-2 text-sm font-medium transition " +
                  (isActive
                    ? "bg-slate-900 text-white shadow"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200")
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {children}
      </section>
    </div>
  );
}
