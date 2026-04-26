"use client";

// Public onboarding page — accessible without login. The token in the
// URL is the only authorisation.

import { use, useEffect, useState } from "react";

import {
  OnboardingForm,
  emptyPayload,
  type OnboardingPayload,
} from "@/components/OnboardingForm";

const DATEV_API_BASE_URL =
  process.env.NEXT_PUBLIC_DATEV_API_BASE_URL ||
  "https://buchhaltung-api.froehlichdienste.de";

type Info = {
  state: "open" | "consumed" | "revoked" | "expired";
  label: string | null;
  prefill: { first_name?: string; surname?: string; email?: string } | null;
};

export default function OnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // Next.js 15: params is a Promise.
  const { token } = use(params);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<OnboardingPayload>(() => emptyPayload());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ pnr: number } | null>(null);

  useEffect(() => {
    fetch(`${DATEV_API_BASE_URL}/onboarding/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          if (res.status === 404) {
            setError("Diesen Link kennen wir nicht.");
          } else if (res.status === 410) {
            setError(
              "Dieser Link ist nicht mehr gültig (eventuell schon eingelöst, zurückgezogen oder abgelaufen)."
            );
          } else {
            setError(`Fehler beim Laden: ${res.status} — ${text.slice(0, 200)}`);
          }
          return null;
        }
        return res.json();
      })
      .then((data: Info | null) => {
        if (!data) return;
        setInfo(data);
        if (data.prefill) {
          setPayload((p) => ({
            ...p,
            personal: {
              ...p.personal,
              first_name: data.prefill?.first_name ?? p.personal.first_name,
              surname: data.prefill?.surname ?? p.personal.surname,
            },
            contact: {
              ...p.contact,
              email: data.prefill?.email ?? p.contact.email,
            },
          }));
        }
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Netzwerkfehler");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${DATEV_API_BASE_URL}/onboarding/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
      }
      const r: { personnel_number: number } = await res.json();
      setDone({ pnr: r.personnel_number });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Absenden fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Wrapper>
        <p className="text-sm text-slate-500">Lade …</p>
      </Wrapper>
    );
  }

  if (error) {
    return (
      <Wrapper>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-800">
          <h2 className="mb-2 text-base font-semibold">Link nicht mehr verwendbar</h2>
          <p>{error}</p>
          <p className="mt-3 text-xs text-red-700">
            Bitte wende Dich an Deine/n Ansprechpartner/in bei Fröhlich Dienste.
          </p>
        </div>
      </Wrapper>
    );
  }

  if (done) {
    return (
      <Wrapper>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-5">
          <h2 className="text-lg font-semibold text-emerald-900">
            Vielen Dank!
          </h2>
          <p className="mt-2 text-sm text-emerald-800">
            Deine Daten sind angekommen und werden direkt in DATEV
            angelegt. Der Link ist jetzt verbraucht und kann nicht erneut
            verwendet werden.
          </p>
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Willkommen bei Fröhlich Dienste
          </h1>
          <p className="mt-2 text-sm text-slate-700">
            Bitte fülle das folgende Formular aus, damit wir Dich für die
            Lohnabrechnung anlegen können. Pflichtfelder sind mit
            <span className="mx-1 text-red-600">*</span>markiert. Der Link
            funktioniert nur einmal — speichere die Eingaben gleich beim
            Absenden ab.
          </p>
          {info?.label ? (
            <p className="mt-1 text-xs text-slate-500">Notiz vom Admin: „{info.label}"</p>
          ) : null}
        </div>

        <OnboardingForm
          payload={payload}
          onChange={setPayload}
          submitLabel="Daten absenden"
          onSubmit={submit}
          saving={saving}
          error={error}
        />
      </div>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white px-6 py-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}
