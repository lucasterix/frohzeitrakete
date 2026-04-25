"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, getMe } from "@/lib/api";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";
import { AlertCircleIcon, CheckCircleIcon, RefreshIcon } from "@/components/icons";

type Abrechnung = {
  id: number;
  patient_name: string;
  monat: string;
  betrag_cent: number;
  status: string;
  kasse_name: string | null;
  gesendet_am: string | null;
};

function formatEuro(cent: number): string {
  return (cent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default function VersandPage() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);
  const [monat, setMonat] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [offene, setOffene] = useState<Abrechnung[]>([]);
  const [gesendete, setGesendete] = useState<Abrechnung[]>([]);
  const [alleOffene, setAlleOffene] = useState<Abrechnung[]>([]);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [sendingAll, setSendingAll] = useState(false);

  const loadData = useCallback(async () => {
    setError("");
    try {
      const [monatRes, alleRes] = await Promise.all([
        fetchWithRefresh(
          `${API_BASE_URL}/admin/pflegehilfsmittel/abrechnungen?monat=${monat}`,
          { headers: buildHeaders() }
        ),
        fetchWithRefresh(
          `${API_BASE_URL}/admin/pflegehilfsmittel/abrechnungen?status=entwurf`,
          { headers: buildHeaders() }
        ),
      ]);

      if (monatRes.ok) {
        const all: Abrechnung[] = await monatRes.json();
        setOffene(all.filter((a) => a.status === "entwurf"));
        setGesendete(all.filter((a) => a.status === "gesendet"));
      }
      if (alleRes.ok) {
        setAlleOffene(await alleRes.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    }
  }, [monat]);

  useEffect(() => {
    (async () => {
      try {
        const me: User = await getMe();
        if (me.role !== "admin" && me.role !== "buero" && me.role !== "standortleiter") {
          router.replace("/user");
          return;
        }
        await loadData();
      } catch {
        router.replace("/");
        return;
      } finally {
        setBooting(false);
      }
    })();
  }, [loadData, router]);

  useEffect(() => {
    if (!booting) void loadData();
  }, [monat, booting, loadData]);

  async function handleSendOne(id: number) {
    setBusyId(id);
    setError("");
    setFlash("");
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/pflegehilfsmittel/abrechnungen/${id}/send`,
        { method: "POST", headers: buildHeaders() }
      );
      if (!res.ok) throw new Error("Senden fehlgeschlagen");
      setFlash("Abrechnung erfolgreich versendet!");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSendAll() {
    setSendingAll(true);
    setError("");
    setFlash("");
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/pflegehilfsmittel/absenden/send-all`,
        {
          method: "POST",
          headers: buildHeaders(),
        }
      );
      if (!res.ok) throw new Error("Sammelversand fehlgeschlagen");
      const data = await res.json().catch(() => ({}));
      setFlash(`Sammelversand erfolgreich! ${data.count ?? ""} Abrechnungen versendet.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSendingAll(false);
    }
  }

  if (booting) return <div className="h-64 animate-pulse rounded-3xl bg-white/60" />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Pflegehilfsmittel
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              Abrechnungen absenden
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Versende die erzeugten Dateien per E-Mail an die Datenannahmestellen.
            </p>
          </div>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <RefreshIcon className="h-4 w-4" />
            Aktualisieren
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircleIcon className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}
      {flash && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircleIcon className="h-5 w-5 shrink-0" />
          {flash}
        </div>
      )}

      {/* Monatsfilter */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Abrechnungsmonat auswaehlen</h2>
        <p className="mb-3 text-sm text-slate-500">
          Waehle den Monat, dessen Abrechnungen du ansehen und ggf. versenden moechtest.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={monat}
            onChange={(e) => setMonat(e.target.value)}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm"
          />
          <span className="text-sm text-slate-500">
            Abrechnungen fuer <strong>{monat}</strong>
          </span>
        </div>
      </section>

      {/* Sammelversand */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Sammelversand</h2>
        <p className="mb-3 text-sm text-slate-500">
          Verschicke alle noch nicht gesendeten Abrechnungen des ausgewaehlten Monats in einem Schritt.
        </p>
        <button
          onClick={handleSendAll}
          disabled={sendingAll || offene.length === 0}
          className="rounded-2xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
        >
          {sendingAll ? "Sende..." : "Alle noch nicht gesendeten Abrechnungen senden"}
        </button>
        {offene.length === 0 && (
          <p className="mt-2 text-sm text-slate-400">
            Keine offenen Abrechnungen vorhanden - alles ist bereits versendet.
          </p>
        )}
      </section>

      {/* Offene Abrechnungen des Monats */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">
          Noch nicht gesendet ({monat})
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          {offene.length} offene Abrechnungen im Monat {monat}.
        </p>
        {offene.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
            Keine offenen Abrechnungen fuer diesen Monat.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                  <th className="px-3 py-3">Patient</th>
                  <th className="px-3 py-3">Pflegekasse</th>
                  <th className="px-3 py-3">Betrag</th>
                  <th className="px-3 py-3">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {offene.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-medium text-slate-900">{a.patient_name}</td>
                    <td className="px-3 py-3 text-slate-600">{a.kasse_name ?? "\u2014"}</td>
                    <td className="px-3 py-3 font-semibold text-slate-700">{formatEuro(a.betrag_cent)}</td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => handleSendOne(a.id)}
                        disabled={busyId === a.id}
                        className="rounded-lg bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-200 disabled:opacity-50"
                      >
                        {busyId === a.id ? "Sende..." : "Jetzt senden"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Bereits gesendet im Monat */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">
          Bereits gesendet ({monat})
        </h2>
        {gesendete.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
            Noch keine Abrechnungen in diesem Monat versendet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                  <th className="px-3 py-3">Patient</th>
                  <th className="px-3 py-3">Pflegekasse</th>
                  <th className="px-3 py-3">Betrag</th>
                  <th className="px-3 py-3">Gesendet am</th>
                </tr>
              </thead>
              <tbody>
                {gesendete.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-medium text-slate-900">{a.patient_name}</td>
                    <td className="px-3 py-3 text-slate-600">{a.kasse_name ?? "\u2014"}</td>
                    <td className="px-3 py-3 font-semibold text-slate-700">{formatEuro(a.betrag_cent)}</td>
                    <td className="px-3 py-3 text-slate-600">
                      {a.gesendet_am
                        ? new Date(a.gesendet_am).toLocaleString("de-DE")
                        : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Monatsuebergreifend offene */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">
          Monatsuebergreifend: Noch nicht gesendete Abrechnungen
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Alle Abrechnungen die noch nicht an die Datenannahmestellen versendet wurden - egal in welchem Monat.
        </p>
        {alleOffene.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
            Keine monatsuebergreifend offenen Abrechnungen. Alles ist versendet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                  <th className="px-3 py-3">Monat</th>
                  <th className="px-3 py-3">Patient</th>
                  <th className="px-3 py-3">Pflegekasse</th>
                  <th className="px-3 py-3">Betrag</th>
                  <th className="px-3 py-3">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {alleOffene.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 text-slate-600">{a.monat}</td>
                    <td className="px-3 py-3 font-medium text-slate-900">{a.patient_name}</td>
                    <td className="px-3 py-3 text-slate-600">{a.kasse_name ?? "\u2014"}</td>
                    <td className="px-3 py-3 font-semibold text-slate-700">{formatEuro(a.betrag_cent)}</td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => handleSendOne(a.id)}
                        disabled={busyId === a.id}
                        className="rounded-lg bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-200 disabled:opacity-50"
                      >
                        {busyId === a.id ? "Sende..." : "Jetzt senden"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
