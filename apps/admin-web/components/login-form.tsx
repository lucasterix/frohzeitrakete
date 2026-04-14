"use client";

import { FormEvent, useState } from "react";
import { User, login } from "@/lib/api";

type LoginFormProps = {
  onLoginSuccess: (user: User) => void;
};

export default function LoginForm({ onLoginSuccess }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage("");

    try {
      const data = await login({ email, password });
      onLoginSuccess(data.user);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Login fehlgeschlagen"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50"
    >
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          Anmelden
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Melde dich mit deinem Account bei der Admin Console an.
        </p>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="name@froehlichdienste.de"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:bg-white"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Passwort
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:bg-white"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-brand-900/30 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Anmelden …" : "Anmelden"}
      </button>

      {errorMessage && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      )}
    </form>
  );
}
