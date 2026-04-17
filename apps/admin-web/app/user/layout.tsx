"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { User, getMe, logout } from "@/lib/api";
import {
  DashboardIcon,
  LogoutIcon,
  RocketIcon,
  UsersIcon,
  SparkleIcon,
  SignatureIcon,
} from "@/components/icons";

const NAV_ITEMS = [
  { href: "/user", label: "Dashboard", icon: DashboardIcon },
  { href: "/user/patienten", label: "Meine Patienten", icon: UsersIcon },
  { href: "/user/einsaetze", label: "Einsatz erfassen", icon: SparkleIcon },
  { href: "/user/urlaub", label: "Mein Urlaub", icon: SignatureIcon },
];

export default function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);

  useEffect(() => {
    getMe()
      .then((u) => {
        if (u.role === "admin") {
          router.replace("/admin");
          return;
        }
        setMe(u);
      })
      .catch(() => router.replace("/"));
  }, [router]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand-50/40">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
              <RocketIcon className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold text-slate-900">
                FrohZeitRakete
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                {me?.full_name ?? "…"}
              </div>
            </div>
          </div>
          <button
            onClick={async () => {
              await logout();
              router.replace("/");
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <LogoutIcon className="h-3.5 w-3.5" />
            Logout
          </button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 lg:px-8">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href ||
              (href !== "/user" && pathname?.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">{children}</div>
    </main>
  );
}
