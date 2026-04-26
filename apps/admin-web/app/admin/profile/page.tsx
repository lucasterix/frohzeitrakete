"use client";

import { useAuth } from "@/lib/auth-context";
import ChangePasswordForm from "@/components/change-password-form";
import MySessionList from "@/components/my-session-list";
import { ShieldIcon, UserCircleIcon } from "@/components/icons";

export default function ProfilePage() {
  const { user: me, isLoading } = useAuth();

  if (isLoading || !me) {
    return (
      <div className="space-y-6">
        <div className="h-32 animate-pulse rounded-3xl bg-white/60" />
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="h-80 animate-pulse rounded-3xl bg-white/60" />
          <div className="h-80 animate-pulse rounded-3xl bg-white/60" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex items-start gap-5">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-2xl font-bold text-white shadow-lg shadow-brand-900/30">
            {me?.full_name ? me.full_name.charAt(0).toUpperCase() : "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Mein Profil
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              {me?.full_name}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{me?.email}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
                <UserCircleIcon className="h-3.5 w-3.5" />
                {me?.role}
              </span>
              {me?.is_active ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  aktiv
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                  inaktiv
                </span>
              )}
              {me?.patti_person_id && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                  <ShieldIcon className="h-3.5 w-3.5" />
                  Patti #{me.patti_person_id}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <ChangePasswordForm />
        <MySessionList />
      </div>
    </div>
  );
}
