"use client";

import { useCallback, useEffect, useState } from "react";
import LoginForm from "@/components/login-form";
import UserForm from "@/components/user-form";
import PatientList from "@/components/patient-list";
import UserEditForm from "@/components/user-edit-form";
import UserSessionList from "@/components/user-session-list";
import UserDangerZone from "@/components/user-danger-zone";
import { User, getMe, getUsers, logout } from "@/lib/api";

export default function AdminUsersPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");

  const [booting, setBooting] = useState(true);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError("");

    try {
      const data = await getUsers();
      setUsers(data);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "Fehler beim Laden der User");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const me = await getMe();
      setCurrentUser(me);
      setIsAuthenticated(true);

      if (me.role === "admin") {
        await loadUsers();
      }
    } catch {
      setIsAuthenticated(false);
      setCurrentUser(null);
    } finally {
      setBooting(false);
    }
  }, [loadUsers]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  async function handleLogout() {
    await logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setUsers([]);
    setUsersError("");
  }

  async function handleLoginSuccess(user: User) {
    setCurrentUser(user);
    setIsAuthenticated(true);

    if (user.role === "admin") {
      await loadUsers();
    }
  }

  if (booting) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-slate-600">Lade Anwendung...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              FrohZeitRakete
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight">Admin Login</h1>
            <p className="mt-3 text-slate-600">
              Login mit HttpOnly-Cookies, Access Token + Refresh Token Rotation und
              Geräte-/Sessionverwaltung.
            </p>

            <div className="mt-6 rounded-2xl bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-800">Was du danach direkt siehst:</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>• aktueller eingeloggter User über `/auth/me`</li>
                <li>• eigene Patienten über `/mobile/patients`</li>
                <li>• Userverwaltung für Admins über `/admin/users`</li>
                <li>• Geräte-/Sessionliste je User mit Revocation</li>
                <li>• Deaktivieren/Löschen von Usern</li>
              </ul>
            </div>
          </div>

          <LoginForm onLoginSuccess={handleLoginSuccess} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              HttpOnly Cookie Auth aktiv
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">Admin – Users</h1>
            <p className="mt-2 text-slate-600">
              Access Token + Refresh Token Rotation mit Geräteverwaltung.
            </p>
            {currentUser ? (
              <p className="mt-2 text-sm text-slate-500">
                Eingeloggt als {currentUser.full_name} ({currentUser.email}) · Rolle:{" "}
                {currentUser.role}
              </p>
            ) : null}
          </div>

          <button
            onClick={handleLogout}
            className="rounded-xl bg-slate-900 px-4 py-3 font-medium text-white transition hover:bg-slate-800"
          >
            Logout
          </button>
        </div>

        {currentUser?.patti_person_id ? (
          <div className="mb-8">
            <PatientList />
          </div>
        ) : (
          <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Meine Patienten</h2>
            <p className="mt-2 text-slate-600">
              Für diesen User ist keine Patti Person ID hinterlegt.
            </p>
          </section>
        )}

        {currentUser?.role === "admin" ? (
          <>
            <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
              <div>
                <UserForm onUserCreated={loadUsers} />
              </div>

              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">User Liste</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Übersicht aller User im System
                    </p>
                  </div>

                  <button
                    onClick={loadUsers}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Neu laden
                  </button>
                </div>

                {usersLoading ? <p className="text-slate-600">Lade User...</p> : null}

                {usersError ? (
                  <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                    {usersError}
                  </p>
                ) : null}

                {!usersLoading && !usersError && users.length === 0 ? (
                  <p className="text-slate-600">Keine User vorhanden.</p>
                ) : null}

                {!usersLoading && !usersError && users.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0">
                      <thead>
                        <tr>
                          <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                            ID
                          </th>
                          <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                            Email
                          </th>
                          <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                            Name
                          </th>
                          <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                            Role
                          </th>
                          <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                            Aktiv
                          </th>
                          <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                            Patti Person ID
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((user) => (
                          <tr key={user.id} className="odd:bg-white even:bg-slate-50/50">
                            <td className="border-b border-slate-100 px-4 py-3 text-sm">
                              {user.id}
                            </td>
                            <td className="border-b border-slate-100 px-4 py-3 text-sm">
                              {user.email}
                            </td>
                            <td className="border-b border-slate-100 px-4 py-3 text-sm">
                              {user.full_name}
                            </td>
                            <td className="border-b border-slate-100 px-4 py-3 text-sm">
                              {user.role}
                            </td>
                            <td className="border-b border-slate-100 px-4 py-3 text-sm">
                              {user.is_active ? "Ja" : "Nein"}
                            </td>
                            <td className="border-b border-slate-100 px-4 py-3 text-sm">
                              {user.patti_person_id ?? "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            </div>

            {users.length > 0 ? (
              <section className="mt-8 space-y-6">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
                  >
                    <div className="mb-4">
                      <h2 className="text-xl font-semibold">{user.full_name}</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {user.email} · Rolle: {user.role}
                      </p>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                      <div className="space-y-6">
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
                ))}
              </section>
            ) : null}
          </>
        ) : (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Keine Admin-Rechte</h2>
            <p className="mt-2 text-slate-600">
              Du bist eingeloggt, aber hast keine Admin-Berechtigung für die Userverwaltung.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}