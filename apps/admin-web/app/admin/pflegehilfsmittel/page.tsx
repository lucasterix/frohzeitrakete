"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRequireRole } from "@/lib/use-require-role";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";
import { AlertCircleIcon, RefreshIcon } from "@/components/icons";

type Abrechnung = {
  id: number;
  patient_name: string;
  monat: string;
  betrag_cent: number;
  status: string;
  created_at: string;
};

type Stats = {
  offen: number;
  gesendet: number;
  storniert: number;
  umsatz_cent: number;
};

function formatEuro(cent: number): string {
  return (cent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    entwurf: "bg-amber-100 text-amber-800",
    gesendet: "bg-emerald-100 text-emerald-800",
    storniert: "bg-red-100 text-red-800",
  };
  return map[status] ?? "bg-slate-100 text-slate-800";
}

const NAV_LINKS = [
  { href: "/admin/pflegehilfsmittel/patienten", label: "Patienten" },
  { href: "/admin/pflegehilfsmittel/abrechnungen", label: "Abrechnungen" },
  { href: "/admin/pflegehilfsmittel/versand", label: "Versand" },
  { href: "/admin/pflegehilfsmittel/archiv", label: "Archiv" },
  { href: "/admin/pflegehilfsmittel/katalog", label: "Katalog" },
  { href: "/admin/pflegehilfsmittel/kassen", label: "Kassen" },
  { href: "/admin/pflegehilfsmittel/einstellungen", label: "Einstellungen" },
];

export default function PflegehilfsmittelDashboard() {
  const { isLoading: authLoading, authorized } = useRequireRole(["admin", "pflegehilfsmittel"]);
  const [stats, setStats] = useState<Stats>({ offen: 0, gesendet: 0, storniert: 0, umsatz_cent: 0 });
  const [recent, setRecent] = useState<Abrechnung[]>([]);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setError("");
    try {
      const [statsRes, recentRes] = await Promise.all([
        fetchWithRefresh(`${API_BASE_URL}/admin/pflegehilfsmittel/stats`, {
          headers: buildHeaders(),
        }),
        fetchWithRefresh(`${API_BASE_URL}/admin/pflegehilfsmittel/abrechnungen?limit=5`, {
          headers: buildHeaders(),
        }),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (recentRes.ok) setRecent(await recentRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    }
  }, []);

  useEffect(() => {
    if (authorized) void loadData();
  }, [authorized, loadData]);

  if (authLoading || !authorized) return <div className="h-64 animate-pulse rounded-3xl bg-white/60" />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Abrechnung
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              Pflegehilfsmittel
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Verwaltung der Pflegehilfsmittel-Abrechnungen nach SGB XI
            </p>
          </div>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <RefreshIcon className="h-4 w-4" />
            Aktualisieren
          </button>
        </div>
      </div>

      {/* Sub-Navigation */}
      <nav className="flex flex-wrap gap-2">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-brand-300"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircleIcon className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {/* Statistik-Karten */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-2xl font-bold text-amber-600">{stats.offen}</p>
          <p className="mt-1 text-xs text-slate-500">Offen / Entwurf</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-2xl font-bold text-emerald-600">{stats.gesendet}</p>
          <p className="mt-1 text-xs text-slate-500">Gesendet</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-2xl font-bold text-red-600">{stats.storniert}</p>
          <p className="mt-1 text-xs text-slate-500">Storniert</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-2xl font-bold text-brand-700">{formatEuro(stats.umsatz_cent)}</p>
          <p className="mt-1 text-xs text-slate-500">Gesamtumsatz</p>
        </div>
      </div>

      {/* Noch nicht versendet - Zaehler */}
      {stats.offen > 0 && (
        <Link
          href="/admin/pflegehilfsmittel/versand"
          className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 shadow-sm transition hover:bg-amber-100"
        >
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {stats.offen} Abrechnung{stats.offen !== 1 ? "en" : ""} noch nicht versendet
            </p>
            <p className="text-xs text-amber-600">Zum Versand wechseln</p>
          </div>
          <span className="text-lg text-amber-600">&rarr;</span>
        </Link>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Link
          href="/admin/pflegehilfsmittel/abrechnungen/neu"
          className="flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
        >
          + Neue Abrechnung
        </Link>
        <Link
          href="/admin/pflegehilfsmittel/patienten"
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Patienten
        </Link>
        <Link
          href="/admin/pflegehilfsmittel/versand"
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Versand
        </Link>
        <Link
          href="/admin/pflegehilfsmittel/archiv"
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Archiv
        </Link>
        <Link
          href="/admin/pflegehilfsmittel/katalog"
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Katalog
        </Link>
        <Link
          href="/admin/pflegehilfsmittel/kassen"
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Kassen
        </Link>
        <Link
          href="/admin/pflegehilfsmittel/einstellungen"
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Einstellungen
        </Link>
      </div>

      {/* Letzte 5 Abrechnungen */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Letzte 5 Abrechnungen</h2>
          <Link
            href="/admin/pflegehilfsmittel/abrechnungen"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Alle anzeigen &rarr;
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
            Noch keine Abrechnungen vorhanden.
          </div>
        ) : (
          <ul className="space-y-2">
            {recent.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3"
              >
                <div>
                  <span className="text-sm font-medium text-slate-900">
                    {item.patient_name}
                  </span>
                  <span className="ml-3 text-xs text-slate-500">{item.monat}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-700">
                    {formatEuro(item.betrag_cent)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusBadge(item.status)}`}
                  >
                    {item.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
