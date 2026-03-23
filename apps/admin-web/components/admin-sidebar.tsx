"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    href: "/admin",
    label: "Dashboard",
  },
  {
    href: "/admin/users",
    label: "User",
  },
  {
    href: "/admin/signatures",
    label: "Signaturen",
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 px-2">
        <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          FrohZeitRakete
        </div>
        <h2 className="mt-3 text-lg font-semibold text-slate-900">Admin</h2>
        <p className="mt-1 text-sm text-slate-500">
          Navigation für Staging und Betrieb
        </p>
      </div>

      <nav className="space-y-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/admin" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-2xl px-4 py-3 text-sm font-medium transition ${
                isActive
                  ? "bg-slate-900 text-white"
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}