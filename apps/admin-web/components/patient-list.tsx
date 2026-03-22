"use client";

import { useEffect, useState } from "react";
import { Patient, getMyPatients } from "@/lib/api";

export default function PatientList() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadPatients() {
    setLoading(true);
    setErrorMessage("");

    try {
      const data = await getMyPatients();
      setPatients(data);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Fehler beim Laden der Patienten"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPatients();
  }, []);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Meine Patienten</h2>
          <p className="mt-1 text-sm text-slate-600">Daten aus /mobile/patients</p>
        </div>

        <button
          onClick={loadPatients}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          neu laden
        </button>
      </div>

      {loading ? <p className="text-slate-600">Lade Patienten...</p> : null}

      {errorMessage ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      {!loading && !errorMessage && patients.length === 0 ? (
        <p className="text-slate-600">Keine Patienten gefunden.</p>
      ) : null}

      {!loading && !errorMessage && patients.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                  Name
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                  Stadt
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                  Adresse
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                  Pflegegrad
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                  Aktiv
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                  Primär
                </th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => (
                <tr
                  key={patient.service_history_id}
                  className="odd:bg-white even:bg-slate-50/50"
                >
                  <td className="border-b border-slate-100 px-4 py-3 text-sm">
                    {patient.display_name}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3 text-sm">
                    {patient.city ?? "-"}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3 text-sm">
                    {patient.address_line ?? "-"}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3 text-sm">
                    {patient.care_degree ?? "-"}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3 text-sm">
                    {patient.active ? "Ja" : "Nein"}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3 text-sm">
                    {patient.is_primary ? "Ja" : "Nein"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}