"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Patient, getMyPatients } from "@/lib/api";

export default function PatientList() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    getMyPatients()
      .then((data) => setPatients(data))
      .catch((error) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Fehler beim Laden der Patienten"
        );
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-2xl bg-white/60"
          />
        ))}
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {errorMessage}
      </div>
    );
  }

  if (patients.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
        Keine Patienten zugewiesen.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {patients.map((p) => {
        const missingData: string[] = [];
        if (!p.phone && !p.address_line) missingData.push("Adresse/Telefon");
        if (!p.insurance_number) missingData.push("Versicherungsnr.");

        return (
          <Link
            key={p.service_history_id}
            href={`/user/patienten/${p.patient_id}`}
            className="block rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-brand-300 hover:shadow-md sm:p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 sm:text-base">
                  {p.display_name}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(p.care_degree_int ?? 0) > 0 && (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-800">
                      Pflegegrad {p.care_degree_int}
                    </span>
                  )}
                  {p.city && (
                    <span className="text-xs text-slate-500">{p.city}</span>
                  )}
                </div>
                {missingData.length > 0 && (
                  <p className="mt-1 text-[10px] text-amber-600">
                    ⚠ Fehlt: {missingData.join(", ")}
                  </p>
                )}
              </div>
              <span className="text-slate-400">›</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
