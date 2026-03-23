import type { ReactNode } from "react";
import AdminSidebar from "@/components/admin-sidebar";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[260px_1fr]">
        <AdminSidebar />
        <div>{children}</div>
      </div>
    </main>
  );
}