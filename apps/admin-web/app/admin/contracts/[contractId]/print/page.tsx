"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AdminContract,
  SignatureEvent,
  User,
  getAdminContract,
  getAdminContracts,
  getMe,
} from "@/lib/api";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function ContractPrintPage() {
  const params = useParams<{ contractId: string }>();
  const router = useRouter();
  const contractId = Number(params?.contractId);

  const [event, setEvent] = useState<SignatureEvent | null>(null);
  const [meta, setMeta] = useState<AdminContract | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const me: User = await getMe();
        if (me.role !== "admin" && me.role !== "buero" && me.role !== "standortleiter") {
          router.replace("/user");
          return;
        }
        const [ev, rows] = await Promise.all([
          getAdminContract(contractId),
          getAdminContracts(),
        ]);
        if (cancelled) return;
        setEvent(ev);
        setMeta(rows.find((r) => r.id === contractId) ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Vertrag nicht geladen"
          );
        }
      }
    }
    if (!Number.isNaN(contractId)) load();
    return () => {
      cancelled = true;
    };
  }, [contractId, router]);

  useEffect(() => {
    if (event) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [event]);

  if (error) {
    return <p className="p-8 text-sm text-red-700">{error}</p>;
  }
  if (!event) {
    return <p className="p-8 text-sm text-slate-500">Lade …</p>;
  }

  const patientLabel = meta?.patient_name ?? `Patient #${event.patient_id}`;

  return (
    <main className="print-root mx-auto max-w-[780px] bg-white p-10 font-serif text-[13px] leading-relaxed text-slate-900">
      <header className="mb-8 flex items-start justify-between border-b-2 border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Betreuungsvertrag
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">
            FrohZeit Rakete · Fröhlich Dienste
          </p>
        </div>
        <div className="text-right text-[11px] text-slate-500">
          Vertrag #{event.id}
          <br />
          {formatDate(event.signed_at)}
        </div>
      </header>

      <section className="mb-6">
        <h2 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Vertragsparteien
        </h2>
        <dl className="grid grid-cols-2 gap-3 text-[12px]">
          <div>
            <dt className="text-[10px] uppercase text-slate-400">Patient</dt>
            <dd className="font-semibold">{patientLabel}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase text-slate-400">Patient-ID</dt>
            <dd className="font-semibold">#{event.patient_id}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase text-slate-400">
              Unterzeichner
            </dt>
            <dd className="font-semibold">{event.signer_name}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase text-slate-400">Quelle</dt>
            <dd className="font-semibold">{event.source}</dd>
          </div>
          {event.info_text_version && (
            <div>
              <dt className="text-[10px] uppercase text-slate-400">
                Info-Text-Version
              </dt>
              <dd className="font-semibold">{event.info_text_version}</dd>
            </div>
          )}
          <div>
            <dt className="text-[10px] uppercase text-slate-400">Status</dt>
            <dd className="font-semibold">{event.status}</dd>
          </div>
        </dl>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Vertragsgegenstand
        </h2>
        <p>
          Hiermit wird der Betreuungsvertrag zwischen {patientLabel} und
          FrohZeit Rakete bestätigt. Der Unterzeichnende bestätigt, dass die
          im mündlichen Informationsgespräch erläuterten Leistungen und
          Konditionen verstanden und akzeptiert wurden.
        </p>
        {event.note && (
          <p className="mt-3 text-[11px] italic text-slate-600">
            Anmerkung: {event.note}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Unterschrift
        </h2>
        <div className="rounded border border-slate-300 p-4">
          {event.asset?.svg_content ? (
            <div
              className="mx-auto max-w-[420px] [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: event.asset.svg_content }}
            />
          ) : (
            <p className="text-center text-xs text-slate-400">
              Keine Unterschrift erfasst.
            </p>
          )}
          <div className="mt-3 border-t border-slate-300 pt-2 text-center text-[11px] text-slate-600">
            {event.signer_name} · {formatDate(event.signed_at)}
          </div>
        </div>
      </section>

      <footer className="mt-10 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400">
        FrohZeit Rakete · Automatisch generiert aus Signatur #{event.id}
      </footer>

      <style jsx global>{`
        @media print {
          body,
          html {
            background: white !important;
          }
          body * {
            visibility: hidden !important;
          }
          .print-root,
          .print-root * {
            visibility: visible !important;
          }
          .print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
          @page {
            size: A4;
            margin: 20mm;
          }
        }
      `}</style>
    </main>
  );
}
