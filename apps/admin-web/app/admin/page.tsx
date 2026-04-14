"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActivityFeedItem,
  SignatureEvent,
  User,
  getActivityFeed,
  getMe,
  getSignatures,
  getUsers,
} from "@/lib/api";
import {
  ActivityIcon,
  AlertCircleIcon,
  RefreshIcon,
  ShieldIcon,
  SignatureIcon,
  SparkleIcon,
  UsersIcon,
} from "@/components/icons";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.froehlichdienste.de";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  leistungsnachweis: "Leistungsnachweis",
  vp_antrag: "VP-Antrag",
  pflegeumwandlung: "Pflegeumwandlung",
};

const DOCUMENT_TYPE_COLORS: Record<string, string> = {
  leistungsnachweis: "bg-brand-500",
  vp_antrag: "bg-emerald-500",
  pflegeumwandlung: "bg-amber-500",
};

function formatDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatRelative(value: string): string {
  const then = new Date(value).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes < 1) return "gerade eben";
  if (diffMinutes < 60) return `vor ${diffMinutes} Min`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `vor ${diffHours} Std`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `vor ${diffDays} Tagen`;

  return formatDateTime(value);
}

type HealthState = "loading" | "ready" | "down";

export default function AdminDashboardPage() {
  const router = useRouter();

  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [usersCount, setUsersCount] = useState(0);
  const [activeUsersCount, setActiveUsersCount] = useState(0);
  const [signatures, setSignatures] = useState<SignatureEvent[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityFeedItem[]>([]);
  const [pageError, setPageError] = useState("");
  const [health, setHealth] = useState<HealthState>("loading");

  const signatureCount = signatures.length;
  const latestSignature = signatures[0] ?? null;

  const stats = useMemo(() => {
    const types = {
      leistungsnachweis: 0,
      vp_antrag: 0,
      pflegeumwandlung: 0,
    };
    let mobileCount = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let todayCount = 0;

    signatures.forEach((s) => {
      if (s.document_type in types) {
        types[s.document_type as keyof typeof types]++;
      }
      if (s.source === "mobile") mobileCount++;
      const signed = new Date(s.signed_at);
      if (signed >= today) todayCount++;
    });

    return { types, mobileCount, todayCount };
  }, [signatures]);

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
      const [users, signatureData, feedData] = await Promise.all([
        getUsers(),
        getSignatures(),
        getActivityFeed(),
      ]);

      setUsersCount(users.length);
      setActiveUsersCount(users.filter((u) => u.is_active).length);
      setSignatures(signatureData);
      setActivityFeed(feedData);
      await checkHealth();
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

  const bootstrap = useCallback(async () => {
    try {
      const me = await getMe();

      if (me.role !== "admin") {
        router.replace("/user");
        return;
      }

      setCurrentUser(me);
      await loadDashboard();
    } catch {
      router.replace("/");
      return;
    } finally {
      setBooting(false);
    }
  }, [loadDashboard, router]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

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
              Übersicht
            </span>
            <HealthBadge state={health} />
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Willkommen zurück, {currentUser?.full_name?.split(" ")[0] ?? ""}
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
          {refreshing ? "Lädt …" : "Aktualisieren"}
        </button>
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
          label="User insgesamt"
          value={usersCount}
          subtext={`${activeUsersCount} aktiv`}
          tone="brand"
          Icon={UsersIcon}
        />
        <KpiCard
          label="Signaturen gesamt"
          value={signatureCount}
          subtext={`${stats.mobileCount} aus Mobile App`}
          tone="emerald"
          Icon={SignatureIcon}
        />
        <KpiCard
          label="Heute erfasst"
          value={stats.todayCount}
          subtext="seit 00:00 Uhr"
          tone="amber"
          Icon={SparkleIcon}
        />
        <KpiCard
          label="Backend-Status"
          value={health === "ready" ? "Online" : health === "down" ? "Down" : "—"}
          subtext={health === "ready" ? "DB erreichbar" : "kein /health/ready"}
          tone={health === "ready" ? "emerald" : "red"}
          Icon={ShieldIcon}
          stringValue
        />
      </div>

      {/* Distribution + Latest Preview */}
      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Dokumente nach Typ
              </h2>
              <p className="text-sm text-slate-500">
                Verteilung der erfassten Unterschriften
              </p>
            </div>
            <span className="text-xs uppercase tracking-wider text-slate-400">
              {signatureCount} gesamt
            </span>
          </div>

          <div className="space-y-4">
            {(
              ["leistungsnachweis", "vp_antrag", "pflegeumwandlung"] as const
            ).map((type) => {
              const count = stats.types[type];
              const percentage =
                signatureCount === 0
                  ? 0
                  : Math.round((count / signatureCount) * 100);

              return (
                <div key={type}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">
                      {DOCUMENT_TYPE_LABELS[type]}
                    </span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {count}{" "}
                      <span className="text-slate-400">({percentage}%)</span>
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all ${DOCUMENT_TYPE_COLORS[type]}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Letzte Signatur
              </h2>
              <p className="text-sm text-slate-500">SVG-Vorschau</p>
            </div>
          </div>

          {latestSignature?.asset?.svg_content ? (
            <>
              <div className="grid min-h-[160px] place-items-center rounded-2xl bg-gradient-to-br from-slate-50 to-brand-50/50 p-4">
                <div
                  className="w-full max-w-[300px] [&>svg]:h-auto [&>svg]:w-full [&>svg]:max-h-[140px]"
                  dangerouslySetInnerHTML={{
                    __html: latestSignature.asset.svg_content,
                  }}
                />
              </div>
              <div className="mt-4 space-y-1 text-xs">
                <p className="font-medium text-slate-700">
                  {DOCUMENT_TYPE_LABELS[latestSignature.document_type] ??
                    latestSignature.document_type}
                </p>
                <p className="text-slate-500">
                  Patient #{latestSignature.patient_id} ·{" "}
                  {latestSignature.signer_name}
                </p>
                <p className="text-slate-400">
                  {formatRelative(latestSignature.signed_at)}
                </p>
              </div>
            </>
          ) : (
            <div className="grid min-h-[200px] place-items-center rounded-2xl bg-slate-50 text-sm text-slate-400">
              Noch keine Signaturen
            </div>
          )}
        </section>
      </div>

      {/* Recent Signatures + Activity */}
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Letzte Unterschriften
              </h2>
              <p className="text-sm text-slate-500">die jüngsten 8 Einträge</p>
            </div>
          </div>

          <div className="space-y-2.5">
            {signatures.length === 0 ? (
              <EmptyState text="Noch keine Signaturen vorhanden." />
            ) : (
              signatures.slice(0, 8).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3 transition hover:border-slate-200 hover:bg-slate-50"
                >
                  <div
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white ${
                      DOCUMENT_TYPE_COLORS[s.document_type] ?? "bg-slate-500"
                    }`}
                  >
                    <SignatureIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {DOCUMENT_TYPE_LABELS[s.document_type] ??
                          s.document_type}
                      </p>
                      <span className="shrink-0 text-xs text-slate-400">
                        {formatRelative(s.signed_at)}
                      </span>
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      Patient #{s.patient_id} · {s.signer_name}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500 ring-1 ring-slate-200">
                    {s.source}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Activity Feed
              </h2>
              <p className="text-sm text-slate-500">
                Live-Stream der Plattform-Events
              </p>
            </div>
            <ActivityIcon className="h-4 w-4 text-slate-400" />
          </div>

          {activityFeed.length === 0 ? (
            <EmptyState text="Keine Aktivität in den letzten Stunden." />
          ) : (
            <ol className="relative space-y-4 border-l-2 border-slate-100 pl-5">
              {activityFeed.slice(0, 10).map((item) => (
                <li key={item.id} className="relative">
                  <span className="absolute -left-[27px] top-1.5 grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-white bg-brand-500 ring-1 ring-brand-200" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {item.title}
                    </p>
                    <p className="text-xs text-slate-500">{item.subtitle}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {formatRelative(item.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
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
        Prüfe Status
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
        <div className="h-64 animate-pulse rounded-3xl bg-white/60 xl:col-span-2" />
        <div className="h-64 animate-pulse rounded-3xl bg-white/60" />
      </div>
    </div>
  );
}

