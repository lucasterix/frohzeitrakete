"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { confirmPasswordReset, requestPasswordReset } from "@/lib/api";

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialToken = searchParams?.get("token") ?? "";

  const [step, setStep] = useState<"request" | "confirm">(
    initialToken ? "confirm" : "request"
  );
  const [email, setEmail] = useState("");
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (initialToken && !token) setToken(initialToken);
  }, [initialToken, token]);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await requestPasswordReset(email.trim());
      setInfo(
        `Wenn ${email} bei uns registriert ist, haben wir eine Reset-Mail an diese Adresse gesendet.`
      );
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen haben");
      return;
    }
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await confirmPasswordReset(token.trim(), newPassword);
      setInfo("Passwort geändert. Du kannst dich jetzt einloggen.");
      setTimeout(() => router.replace("/"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-50 to-brand-50/40 px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Passwort zurücksetzen
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {step === "request"
            ? "Gib deine E-Mail ein, um einen Reset-Link zu bekommen."
            : "Trage den Code aus der Mail und dein neues Passwort ein."}
        </p>

        {step === "request" ? (
          <form onSubmit={handleRequest} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                E-Mail
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:bg-white"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-2xl bg-brand-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? "Sende …" : "Reset-Link anfordern"}
            </button>
            <button
              type="button"
              onClick={() => setStep("confirm")}
              className="w-full text-xs text-slate-500 hover:text-slate-800"
            >
              Ich habe bereits einen Code
            </button>
          </form>
        ) : (
          <form onSubmit={handleConfirm} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Code aus der Mail
              </span>
              <input
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:bg-white"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Neues Passwort
              </span>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:bg-white"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-2xl bg-brand-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? "Speichere …" : "Passwort setzen"}
            </button>
            <button
              type="button"
              onClick={() => setStep("request")}
              className="w-full text-xs text-slate-500 hover:text-slate-800"
            >
              Zurück zur E-Mail-Eingabe
            </button>
          </form>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
        {info && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {info}
          </div>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Lade …</div>}>
      <ResetPasswordInner />
    </Suspense>
  );
}
