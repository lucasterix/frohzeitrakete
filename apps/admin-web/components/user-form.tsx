"use client";

import { FormEvent, useEffect, useState } from "react";
import { CreateUserPayload, User, createUser, getUsers } from "@/lib/api";

type UserFormProps = {
  onUserCreated: () => void;
};

export default function UserForm({ onUserCreated }: UserFormProps) {
  const [formData, setFormData] = useState<CreateUserPayload>({
    email: "",
    password: "",
    full_name: "",
    role: "caretaker",
    is_active: true,
    patti_person_id: null,
  });

  const [siteLeaders, setSiteLeaders] = useState<User[]>([]);

  useEffect(() => {
    getUsers()
      .then((users) =>
        setSiteLeaders(users.filter((u) => u.role === "standortleiter"))
      )
      .catch(() => {});
  }, []);

  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function updateField<K extends keyof CreateUserPayload>(
    key: K,
    value: CreateUserPayload[K]
  ) {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      await createUser({
        ...formData,
        patti_person_id:
          formData.patti_person_id === null || formData.patti_person_id === undefined
            ? null
            : Number(formData.patti_person_id),
      });

      setSuccessMessage("User erfolgreich erstellt.");
      setFormData({
        email: "",
        password: "",
        full_name: "",
        role: "caretaker",
        is_active: true,
        patti_person_id: null,
      });

      onUserCreated();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 className="mb-5 text-xl font-semibold">Neuen User anlegen</h2>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => updateField("email", e.target.value)}
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-0 transition focus:border-slate-500"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Passwort</span>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => updateField("password", e.target.value)}
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-0 transition focus:border-slate-500"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Voller Name</span>
          <input
            type="text"
            value={formData.full_name}
            onChange={(e) => updateField("full_name", e.target.value)}
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-0 transition focus:border-slate-500"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Rolle</span>
          <select
            value={formData.role}
            onChange={(e) => updateField("role", e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
          >
            <option value="caretaker">caretaker</option>
            <option value="buero">buero</option>
            <option value="standortleiter">standortleiter</option>
            <option value="buchhaltung">buchhaltung</option>
            <option value="admin">admin</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Abteilung</span>
          <select
            value={formData.department ?? ""}
            onChange={(e) =>
              updateField("department", e.target.value === "" ? null : e.target.value)
            }
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
          >
            <option value="">— keine Zuordnung —</option>
            <option value="buero">Büro</option>
            <option value="tagesgeschaeft">Tagesgeschäft</option>
            <option value="assistenz_gf">Assistenz der Geschäftsführung</option>
            <option value="geschaeftsfuehrung">Geschäftsführung</option>
            <option value="abrechnung">Abrechnung</option>
            <option value="mahnwesen">Mahnwesen</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Standortleiter
          </span>
          <select
            value={formData.site_leader_id ?? ""}
            onChange={(e) =>
              updateField(
                "site_leader_id",
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
          >
            <option value="">— kein Standortleiter —</option>
            {siteLeaders.map((sl) => (
              <option key={sl.id} value={sl.id}>
                {sl.full_name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Patti Person ID
          </span>
          <input
            type="number"
            value={formData.patti_person_id ?? ""}
            onChange={(e) =>
              updateField(
                "patti_person_id",
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-0 transition focus:border-slate-500"
          />
        </label>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={formData.is_active ?? true}
            onChange={(e) => updateField("is_active", e.target.checked)}
            className="h-4 w-4"
          />
          Aktiv
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Speichert..." : "Create User"}
      </button>

      {successMessage ? (
        <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}