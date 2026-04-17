"use client";

import PatientList from "@/components/patient-list";

export default function UserPatientenPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Meine Patienten
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Deine zugewiesenen Patienten aus Patti mit Reststunden und Details.
        </p>
      </div>
      <PatientList />
    </div>
  );
}
