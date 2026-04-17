"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";

export default function PatientDetailPage() {
  const { patientId } = useParams();
  const [patient, setPatient] = useState<any>(null);
  const [budget, setBudget] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [pRes, bRes] = await Promise.all([
          fetchWithRefresh(`${API_BASE_URL}/mobile/patients/${patientId}`, {
            headers: buildHeaders(),
          }),
          fetchWithRefresh(
            `${API_BASE_URL}/mobile/patients/${patientId}/patti-budget?year=${new Date().getFullYear()}`,
            { headers: buildHeaders() }
          ),
        ]);
        if (pRes.ok) setPatient(await pRes.json());
        if (bRes.ok) setBudget(await bRes.json());
      } catch {}
      setLoading(false);
    })();
  }, [patientId]);

  if (loading) return <div className="h-64 animate-pulse rounded-2xl bg-white/60" />;
  if (!patient) return <p className="text-sm text-slate-500">Patient nicht gefunden.</p>;

  const totalH = budget
    ? (budget.care_service_remaining_hours || 0) + (budget.respite_care_remaining_hours || 0)
    : null;

  function Info({ label, value }: { label: string; value: string | null | undefined }) {
    return (
      <div className="flex justify-between border-b border-slate-100 py-2">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-xs font-medium text-slate-900">{value || "—"}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              {patient.display_name || `${patient.first_name} ${patient.last_name}`}
            </h1>
            {(patient.care_degree_int ?? 0) > 0 && (
              <span className="mt-1 inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-800">
                Pflegegrad {patient.care_degree_int}
              </span>
            )}
          </div>
          {totalH != null && (
            <div className="text-right">
              <p className={`text-2xl font-bold ${totalH > 5 ? "text-brand-700" : totalH > 0 ? "text-amber-600" : "text-red-600"}`}>
                {totalH.toFixed(1)} h
              </p>
              <p className="text-[10px] text-slate-400">Reststunden</p>
            </div>
          )}
        </div>
      </div>

      {budget && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
            <p className="text-lg font-bold text-brand-700">
              {(budget.care_service_remaining_hours || 0).toFixed(1)} h
            </p>
            <p className="text-[10px] text-slate-400">Betreuung (BL §45b)</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
            <p className="text-lg font-bold text-blue-600">
              {(budget.respite_care_remaining_hours || 0).toFixed(1)} h
            </p>
            <p className="text-[10px] text-slate-400">Verhinderungspflege (VP §39)</p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Stammdaten</h2>
        <Info label="Adresse" value={[patient.address_line, patient.postal_code, patient.city].filter(Boolean).join(", ")} />
        <Info label="Telefon" value={patient.phone} />
        <Info label="Festnetz" value={patient.phone_landline} />
        <Info label="Geburtstag" value={patient.birthday} />
        <Info label="Versicherung" value={patient.insurance_company_name} />
        <Info label="Vers.-Nr." value={patient.insurance_number} />
        <Info label="Status" value={patient.active ? "Aktiv" : "Inaktiv"} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href={`/user/einsaetze?patient=${patientId}`}
          className="flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700">
          ＋ Einsatz erfassen
        </Link>
        <Link href="/user/patienten"
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          ← Zurück
        </Link>
      </div>
    </div>
  );
}
