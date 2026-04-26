"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DashboardStats,
  getDashboardStats,
} from "@/lib/api";
import Link from "next/link";
import { getDailyQuote } from "@/lib/daily-quotes";
import {
  AlertCircleIcon,
  InboxIcon,
  RefreshIcon,
  ShieldIcon,
  SparkleIcon,
  UsersIcon,
} from "@/components/icons";
import { useRequireAdmin } from "@/lib/use-require-role";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.froehlichdienste.de";

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "short" }).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}

type HealthState = "loading" | "ready" | "down";

export default function AdminDashboardPage() {
  const { user: currentUser, isLoading: authLoading, authorized } = useRequireAdmin();

  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pageError, setPageError] = useState("");
  const [health, setHealth] = useState<HealthState>("loading");

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/health/ready`, {
        cache: "no-store",
      });
      setHealth(res.ok ? "ready" : "down");
    } catch {
      setHealth("down");
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    setRefreshing(true);
    setPageError("");

    try {
      const [dashboardStats] = await Promise.all([
        getDashboardStats(),
        checkHealth(),
      ]);
      setStats(dashboardStats);
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Fehler beim Laden des Dashboards"
      );
    } finally {
      setRefreshing(false);
    }
  }, [checkHealth]);

  useEffect(() => {
    if (!authorized) return;
    loadDashboard().finally(() => setBooting(false));
  }, [authorized, loadDashboard]);

  if (booting) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Dashboard
            </span>
            <HealthBadge state={health} />
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Willkommen zurueck, {currentUser?.full_name?.split(" ")[0] ?? ""}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Hier ist der aktuelle Stand der FrohZeitRakete-Plattform.
          </p>
        </div>

        <button
          onClick={loadDashboard}
          disabled={refreshing}
          className="inline-flex items-center gap-2 self-start rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshIcon
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
          {refreshing ? "Laedt ..." : "Aktualisieren"}
        </button>
      </div>

      {/* Tagesspruch */}
      <div className="rounded-2xl border border-brand-200 bg-brand-50/50 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
          ✨ Tagesspruch
        </p>
        <p className="mt-1 text-sm font-medium leading-relaxed text-slate-800">
          {getDailyQuote()}
        </p>
      </div>

      {pageError && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircleIcon className="h-5 w-5 shrink-0" />
          {pageError}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Backend-Status"
          value={health === "ready" ? "Online" : health === "down" ? "OFFLINE" : "--"}
          subtext={health === "ready" ? "DB erreichbar" : "⚠️ IT anrufen: Lucas oder Daniel!"}
          tone={health === "ready" ? "emerald" : "red"}
          Icon={ShieldIcon}
          stringValue
        />
        <KpiCard
          label="App-Status"
          value={health === "ready" ? "Online" : health === "down" ? "OFFLINE" : "--"}
          subtext={health === "ready" ? "Frontend erreichbar" : "⚠️ IT anrufen: Lucas oder Daniel!"}
          tone={health === "ready" ? "emerald" : "red"}
          Icon={ShieldIcon}
          stringValue
        />
        <KpiCard
          label="Heute gearbeitet"
          value={stats ? `${stats.today_total_hours.toFixed(1)} h` : "--"}
          subtext="Gesamtstunden aller Mitarbeiter"
          tone="brand"
          Icon={SparkleIcon}
          stringValue
        />
        <KpiCard
          label="Monats-Prognose"
          value={stats ? `${stats.month_projection.toFixed(0)} h` : "--"}
          subtext={
            stats
              ? `${stats.month_total_hours.toFixed(1)} h bisher (${stats.month_workdays_elapsed}/${stats.month_workdays_total} AT)`
              : "Hochrechnung"
          }
          tone="amber"
          Icon={SparkleIcon}
          stringValue
        />
      </div>

      {/* Offene Aufgaben */}
      {stats?.pending_tasks && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">
            Offene Aufgaben
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <TaskCard
              href="/admin/contracts"
              label="Vertraege"
              sublabel="noch an KK zu senden"
              count={stats.pending_tasks.contracts_pending}
            />
            <TaskCard
              href="/admin/vp-antraege"
              label="VP-Antraege"
              sublabel="noch zu bearbeiten"
              count={stats.pending_tasks.vp_antraege_pending}
            />
            <TaskCard
              href="/admin/budget-inquiries"
              label="Budgetabfragen"
              sublabel="noch zu versenden"
              count={stats.pending_tasks.budget_inquiries_pending}
            />
          </div>
        </div>
      )}

      {/* Vacation + Sick */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* Heute im Urlaub */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Heute im Urlaub
            </h2>
            <p className="text-sm text-slate-500">
              {stats?.today_vacation.length ?? 0} Mitarbeiter
            </p>
          </div>
          {!stats?.today_vacation.length ? (
            <EmptyState text="Niemand hat heute Urlaub." />
          ) : (
            <ul className="space-y-2">
              {stats.today_vacation.map((v, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600">
                    <UsersIcon className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium text-slate-800">
                    {v.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Diese Woche im Urlaub */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Diese Woche im Urlaub
            </h2>
            <p className="text-sm text-slate-500">
              Mo-Fr, {stats?.week_vacation.length ?? 0} Mitarbeiter
            </p>
          </div>
          {!stats?.week_vacation.length ? (
            <EmptyState text="Niemand hat diese Woche Urlaub." />
          ) : (
            <ul className="space-y-2">
              {stats.week_vacation.map((v, i) => (
                <li
                  key={i}
                  className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600">
                      <UsersIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">
                        {v.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {v.dates.map(formatDate).join(", ")}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Aktuell krankgemeldet */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Aktuell krankgemeldet
            </h2>
            <p className="text-sm text-slate-500">
              {stats?.currently_sick.length ?? 0} Mitarbeiter
            </p>
          </div>
          {!stats?.currently_sick.length ? (
            <EmptyState text="Aktuell niemand krankgemeldet." />
          ) : (
            <ul className="space-y-2">
              {stats.currently_sick.map((s, i) => (
                <li
                  key={i}
                  className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-100 text-red-600">
                      <AlertCircleIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">
                        {s.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {s.from_date && s.to_date
                          ? `${formatDate(s.from_date)} - ${formatDate(s.to_date)}`
                          : "Zeitraum unbekannt"}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Schnellzugriffe */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link
          href="/admin/vertretungen"
          className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
            <UsersIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Vertretungen</p>
            <p className="text-xs text-slate-500">Vertretungsplan verwalten</p>
          </div>
        </Link>
        <Link
          href="/admin/lohnabrechnung"
          className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-50 text-purple-600">
            <SparkleIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Lohnabrechnung melden</p>
            <p className="text-xs text-slate-500">Krank, Vorschuss, Rückfrage</p>
          </div>
        </Link>
        <Link
          href="/admin/posteingang"
          className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
            <InboxIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Posteingang</p>
            <p className="text-xs text-slate-500">Briefe einscannen & zuweisen</p>
          </div>
        </Link>
        <Link
          href="/admin/budget-inquiries"
          className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
            <ShieldIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Budgetabfragen</p>
            <p className="text-xs text-slate-500">§45b Anfragen erstellen</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

/* ---------------- Sub-components ---------------- */

type KpiTone = "brand" | "emerald" | "amber" | "red" | "slate";

const TONE_STYLES: Record<KpiTone, { bg: string; text: string; ring: string }> = {
  brand: {
    bg: "bg-gradient-to-br from-brand-500 to-brand-700",
    text: "text-white",
    ring: "ring-brand-200",
  },
  emerald: {
    bg: "bg-gradient-to-br from-emerald-500 to-emerald-700",
    text: "text-white",
    ring: "ring-emerald-200",
  },
  amber: {
    bg: "bg-gradient-to-br from-amber-400 to-amber-600",
    text: "text-white",
    ring: "ring-amber-200",
  },
  red: {
    bg: "bg-gradient-to-br from-red-500 to-red-700",
    text: "text-white",
    ring: "ring-red-200",
  },
  slate: {
    bg: "bg-gradient-to-br from-slate-700 to-slate-900",
    text: "text-white",
    ring: "ring-slate-300",
  },
};

function KpiCard({
  label,
  value,
  subtext,
  tone,
  Icon,
  stringValue,
}: {
  label: string;
  value: number | string;
  subtext: string;
  tone: KpiTone;
  Icon: (props: React.SVGProps<SVGSVGElement>) => JSX.Element;
  stringValue?: boolean;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {label}
          </p>
          <p
            className={`mt-2 font-bold tracking-tight text-slate-900 ${
              stringValue ? "text-2xl" : "text-3xl tabular-nums"
            }`}
          >
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-500">{subtext}</p>
        </div>
        <div
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl shadow-lg ring-4 ${styles.bg} ${styles.text} ${styles.ring}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function HealthBadge({ state }: { state: HealthState }) {
  if (state === "loading") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
        Pruefe Status
      </span>
    );
  }

  if (state === "ready") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        System bereit
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-red-200">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
      Backend nicht erreichbar
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-400">
      {text}
    </div>
  );
}

function TaskCard({
  href,
  label,
  sublabel,
  count,
}: {
  href: string;
  label: string;
  sublabel: string;
  count: number;
}) {
  const hasOpen = count > 0;
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
            {count}
          </p>
          <p className="mt-1 text-xs text-slate-500">{sublabel}</p>
        </div>
        <div
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl shadow-lg ring-4 ${
            hasOpen
              ? "bg-gradient-to-br from-amber-400 to-amber-600 text-white ring-amber-200"
              : "bg-gradient-to-br from-emerald-500 to-emerald-700 text-white ring-emerald-200"
          }`}
        >
          <InboxIcon className="h-5 w-5" />
        </div>
      </div>
      {!hasOpen && (
        <p className="mt-2 text-xs font-medium text-emerald-600">
          Alles erledigt
        </p>
      )}
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-32 animate-pulse rounded-3xl bg-white/60" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-3xl bg-white/60" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="h-64 animate-pulse rounded-3xl bg-white/60" />
        <div className="h-64 animate-pulse rounded-3xl bg-white/60" />
        <div className="h-64 animate-pulse rounded-3xl bg-white/60" />
      </div>
    </div>
  );
}
