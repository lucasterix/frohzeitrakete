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
  InboxIcon,
} from "@/components/icons";

const NAV_ITEMS = [
  { href: "/user", label: "Start", icon: DashboardIcon },
  { href: "/user/patienten", label: "Patienten", icon: UsersIcon },
  { href: "/user/nachrichten", label: "Nachrichten", icon: InboxIcon },
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
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-3 py-2 sm:px-4 sm:py-3 lg:px-8">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white sm:h-9 sm:w-9 sm:rounded-xl">
              <RocketIcon className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold text-slate-900">
                FrohZeit
              </div>
              <div className="hidden text-[10px] uppercase tracking-wider text-slate-400 sm:block">
                {me?.full_name ?? "…"}
              </div>
            </div>
          </div>
          <button
            onClick={async () => {
              await logout();
              router.replace("/");
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2"
          >
            <LogoutIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
        <nav className="-mb-px mx-auto flex max-w-6xl gap-0 overflow-x-auto px-3 sm:px-4 lg:px-8">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href ||
              (href !== "/user" && pathname?.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm ${
                  active
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                }`}
              >
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6 lg:px-8">{children}</div>
    </main>
  );
}
