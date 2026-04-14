import type { ReactNode } from "react";
import AdminSidebar from "@/components/admin-sidebar";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand-50/40 px-4 py-6 lg:px-8 lg:py-8">
      <div className="mx-auto flex max-w-[1600px] gap-6 lg:gap-8">
        <div className="hidden w-[260px] shrink-0 lg:block">
          <div className="sticky top-8">
            <AdminSidebar />
          </div>
        </div>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </main>
  );
}
