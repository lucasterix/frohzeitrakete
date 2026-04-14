"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import UserForm from "@/components/user-form";
import UserEditForm from "@/components/user-edit-form";
import UserSessionList from "@/components/user-session-list";
import UserDangerZone from "@/components/user-danger-zone";
import { User, getMe, getUsers } from "@/lib/api";
import { AlertCircleIcon, RefreshIcon, UsersIcon } from "@/components/icons";

export default function AdminUsersPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [booting, setBooting] = useState(true);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "caretaker">(
    "all"
  );
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">(
    "all"
  );
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError("");

    try {
      const data = await getUsers();
      setUsers(data);
    } catch (error) {
      setUsersError(
        error instanceof Error ? error.message : "Fehler beim Laden der User"
      );
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const me = await getMe();

      if (me.role !== "admin") {
        router.replace("/user");
        return;
      }

      setCurrentUser(me);
      await loadUsers();
    } catch {
      router.replace("/");
      return;
    } finally {
      setBooting(false);
    }
  }, [loadUsers, router]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (
        q &&
        !u.email.toLowerCase().includes(q) &&
        !u.full_name.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (activeFilter === "active" && !u.is_active) return false;
      if (activeFilter === "inactive" && u.is_active) return false;
      return true;
    });
  }, [users, search, roleFilter, activeFilter]);

  if (booting) {
    return (
      <div className="space-y-6">
        <div className="h-32 animate-pulse rounded-3xl bg-white/60" />
        <div className="h-96 animate-pulse rounded-3xl bg-white/60" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Verwaltung
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              User
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {filteredUsers.length} von {users.length} Usern · Sessions, Rollen
              und Stammdaten verwalten.
            </p>
          </div>

          <button
            onClick={loadUsers}
            disabled={usersLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshIcon
              className={`h-4 w-4 ${usersLoading ? "animate-spin" : ""}`}
            />
            Neu laden
          </button>
        </div>
      </div>

      {usersError && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircleIcon className="h-5 w-5 shrink-0" />
          {usersError}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
        <UserForm onUserCreated={loadUsers} />

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-slate-900">User-Liste</h2>
            <p className="mt-1 text-sm text-slate-500">
              Klicken auf einen User, um Details und Sessions zu verwalten.
            </p>
          </div>

          {/* Filters */}
          <div className="mb-5 flex flex-col gap-3 sm:flex-row">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Email oder Name suchen …"
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-white"
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
              className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-white"
            >
              <option value="all">Alle Rollen</option>
              <option value="admin">Admin</option>
              <option value="caretaker">Caretaker</option>
            </select>
            <select
              value={activeFilter}
              onChange={(e) =>
                setActiveFilter(e.target.value as typeof activeFilter)
              }
              className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-white"
            >
              <option value="all">Alle Status</option>
              <option value="active">Nur aktiv</option>
              <option value="inactive">Nur inaktiv</option>
            </select>
          </div>

          {usersLoading && (
            <p className="text-sm text-slate-500">Lade User …</p>
          )}

          {!usersLoading && filteredUsers.length === 0 && (
            <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
              <UsersIcon className="mb-2 h-8 w-8" />
              Keine User entsprechen den Filtern.
            </div>
          )}

          {!usersLoading && filteredUsers.length > 0 && (
            <div className="space-y-2.5">
              {filteredUsers.map((user) => {
                const isExpanded = expandedUserId === user.id;
                return (
                  <div
                    key={user.id}
                    className={`overflow-hidden rounded-2xl border transition ${
                      isExpanded
                        ? "border-brand-200 bg-brand-50/30 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedUserId(isExpanded ? null : user.id)
                      }
                      className="flex w-full items-center gap-4 px-4 py-3 text-left"
                    >
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-semibold text-white">
                        {user.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {user.full_name}
                          </p>
                          <RoleBadge role={user.role} />
                          {!user.is_active && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-600">
                              inaktiv
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-slate-500">
                          {user.email}
                          {user.patti_person_id && (
                            <span className="ml-2 text-amber-600">
                              · Patti #{user.patti_person_id}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="text-xs text-slate-400">
                        {isExpanded ? "schließen" : "öffnen"}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-200 bg-white px-4 py-5">
                        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
                          <div className="space-y-5">
                            <UserEditForm user={user} onUpdated={loadUsers} />
                            <UserDangerZone
                              user={user}
                              currentUserId={currentUser?.id ?? null}
                              onUpdated={loadUsers}
                            />
                          </div>
                          <UserSessionList userId={user.id} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === "admin") {
    return (
      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-medium uppercase text-brand-700">
        admin
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase text-emerald-700">
      caretaker
    </span>
  );
}
