"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { User, getMe, logout } from "@/lib/api";
import {
  AlertCircleIcon,
  CalculatorIcon,
  DashboardIcon,
  InboxIcon,
  LogoutIcon,
  RocketIcon,
  ShieldIcon,
  SignatureIcon,
  SparkleIcon,
  UserCircleIcon,
  UsersIcon,
} from "@/components/icons";

type NavItem = {
  href: string;
  label: string;
  Icon: typeof DashboardIcon;
  adminOnly?: boolean;
  roles?: string[];
  access?: string; // z.B. "Admin", "Alle", "Admin, Buchhaltung" — nur für Admins sichtbar
};

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", Icon: DashboardIcon, adminOnly: true, access: "Admin" },
  { href: "/admin/tasks", label: "Aufgaben", Icon: InboxIcon, access: "Alle" },
  { href: "/admin/office-inbox", label: "Office Inbox", Icon: InboxIcon, access: "Alle" },
  { href: "/admin/vertretungen", label: "Vertretungen", Icon: UsersIcon, access: "Alle" },
  { href: "/admin/intakes", label: "Neuaufnahmen", Icon: UsersIcon, access: "Alle" },
  { href: "/admin/trainings", label: "Fortbildungen", Icon: SparkleIcon, adminOnly: true, access: "Admin" },
  { href: "/admin/users", label: "User", Icon: UsersIcon, adminOnly: true, access: "Admin" },
  { href: "/admin/leistungsnachweise", label: "Leistungsnachweise", Icon: SignatureIcon, access: "Alle" },
  { href: "/admin/vp-antraege", label: "VP-Anträge", Icon: SignatureIcon, access: "Alle" },
  { href: "/admin/contracts", label: "Verträge", Icon: ShieldIcon, access: "Alle" },
  { href: "/admin/pflegehilfsmittel", label: "Pflegehilfsmittel", Icon: ShieldIcon, access: "Alle" },
  { href: "/admin/budget-inquiries", label: "Budgetabfragen", Icon: ShieldIcon, access: "Alle" },
  { href: "/admin/posteingang", label: "Posteingang", Icon: InboxIcon, access: "Alle" },
  { href: "/admin/lohnabrechnung", label: "Lohnabrechnung", Icon: CalculatorIcon, access: "Alle" },
  { href: "/admin/sheets-matching", label: "Stundenabgleich", Icon: SparkleIcon, adminOnly: true, access: "Admin" },
  { href: "/admin/it-tickets", label: "IT-Tickets", Icon: AlertCircleIcon, adminOnly: true, access: "Admin" },
  { href: "/admin/buchhaltung", label: "Buchhaltung", Icon: CalculatorIcon, roles: ["admin", "buchhaltung"], access: "Admin, Buchhaltung" },
  { href: "/admin/sync-errors", label: "Sync-Fehler", Icon: ShieldIcon, adminOnly: true, access: "Admin" },
  { href: "/admin/profile", label: "Profil", Icon: UserCircleIcon, access: "Alle" },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);

  useEffect(() => {
    getMe().then(setMe).catch(() => setMe(null));
  }, []);

  async function handleLogout() {
    await logout();
    router.replace("/");
  }

  return (
    <aside className="flex h-full flex-col rounded-3xl bg-slate-900 p-5 text-slate-100 shadow-xl">
      <div className="flex items-center gap-3 px-2 pb-6 pt-2">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-900/40">
          <RocketIcon className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-base font-bold tracking-tight text-white">
            FrohZeitRakete
          </div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400">
            Admin Console
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.filter((item) => {
          if (item.roles) return me?.role ? item.roles.includes(me.role) : false;
          if (item.adminOnly) return me?.role === "admin";
          return true;
        }).map(({ href, label, Icon, access }) => {
          const isActive =
            pathname === href ||
            (href !== "/admin" && pathname?.startsWith(href));

          return (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-white/10 text-white shadow-inner"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span
                className={`grid h-8 w-8 place-items-center rounded-xl transition ${
                  isActive
                    ? "bg-brand-500 text-white"
                    : "bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-200"
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex-1">{label}</span>
              {me?.role === "admin" && access && access !== "Alle" && (
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
                  {access}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Patti öffnen */}
      <div className="mt-4 px-1">
        <a
          href="https://patti.app"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-500/20 to-amber-600/10 px-3 py-2.5 text-sm font-medium text-amber-200 transition hover:from-amber-500/30 hover:to-amber-600/20 hover:text-amber-100"
        >
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-500/20 text-amber-300">
            <RocketIcon className="h-4 w-4" />
          </span>
          Patti öffnen ↗
        </a>
      </div>

      <div className="mt-6 space-y-3 border-t border-white/10 pt-5">
        <div className="rounded-2xl bg-white/5 px-3 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-semibold text-white">
              {me?.full_name ? me.full_name.charAt(0).toUpperCase() : "?"}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white">
                {me?.full_name ?? "—"}
              </div>
              <div className="truncate text-[11px] text-slate-400">
                {me?.email ?? "nicht geladen"}
              </div>
            </div>
          </div>
          {me?.role ? (
            <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
              {me.role}
            </div>
          ) : null}
        </div>

        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-transparent px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
        >
          <LogoutIcon className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
