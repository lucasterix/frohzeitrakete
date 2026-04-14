"use client";

import { FormEvent, useMemo, useState } from "react";
import { User, updateUser } from "@/lib/api";

type Props = {
  user: User;
  onUpdated: () => void;
};

export default function UserEditForm({ user, onUpdated }: Props) {
  const [email, setEmail] = useState(user.email);
  const [fullName, setFullName] = useState(user.full_name);
  const [role, setRole] = useState(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [pattiPersonId, setPattiPersonId] = useState<number | null>(
    user.patti_person_id
  );
  const [hasCompanyCar, setHasCompanyCar] = useState<boolean>(
    user.has_company_car ?? false
  );
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const hasChanges = useMemo(() => {
    return (
      email !== user.email ||
      fullName !== user.full_name ||
      role !== user.role ||
      isActive !== user.is_active ||
      pattiPersonId !== user.patti_person_id ||
      hasCompanyCar !== (user.has_company_car ?? false) ||
      password.trim() !== ""
    );
  }, [
    email,
    fullName,
    role,
    isActive,
    pattiPersonId,
    hasCompanyCar,
    password,
    user,
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      await updateUser(user.id, {
        email,
        full_name: fullName,
        role,
        is_active: isActive,
        patti_person_id: pattiPersonId,
        has_company_car: hasCompanyCar,
        password: password.trim() === "" ? null : password,
      });

      setPassword("");
      setSuccessMessage("User erfolgreich aktualisiert.");
      onUpdated();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Fehler beim Aktualisieren"
      );
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setEmail(user.email);
    setFullName(user.full_name);
    setRole(user.role);
    setIsActive(user.is_active);
    setPattiPersonId(user.patti_person_id);
    setHasCompanyCar(user.has_company_car ?? false);
    setPassword("");
    setSuccessMessage("");
    setErrorMessage("");
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-slate-50"
      >
        <div>
          <div className="text-base font-semibold text-slate-900">
            {fullName || user.full_name}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {email} · Rolle: {role} · {isActive ? "aktiv" : "inaktiv"}
          </div>
        </div>

        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          {isOpen ? "Schließen" : "Bearbeiten"}
        </div>
      </button>

      {isOpen ? (
        <div className="border-t border-slate-200 px-5 py-5">
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Email
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Voller Name
                </span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Rolle
                </span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
                >
                  <option value="caretaker">caretaker</option>
                  <option value="admin">admin</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Patti Person ID
                </span>
                <input
                  type="number"
                  value={pattiPersonId ?? ""}
                  onChange={(e) =>
                    setPattiPersonId(
                      e.target.value === "" ? null : Number(e.target.value)
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Neues Passwort
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leer lassen, wenn das Passwort unverändert bleiben soll"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
                />
              </label>

              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 md:col-span-2">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4"
                />
                User ist aktiv
              </label>

              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 md:col-span-2">
                <input
                  type="checkbox"
                  checked={hasCompanyCar}
                  onChange={(e) => setHasCompanyCar(e.target.checked)}
                  className="h-4 w-4"
                />
                Dienstwagen — keine Fahrtkosten-Erstattung
                <span className="text-xs font-normal text-slate-500">
                  (Km werden im Report automatisch als bezahlt markiert)
                </span>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={loading || !hasChanges}
                className="rounded-xl bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Speichert..." : "Änderungen speichern"}
              </button>

              <button
                type="button"
                onClick={handleReset}
                disabled={loading}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Zurücksetzen
              </button>
            </div>

            {successMessage ? (
              <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {successMessage}
              </p>
            ) : null}

            {errorMessage ? (
              <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </p>
            ) : null}
          </form>
        </div>
      ) : null}
    </div>
  );
}