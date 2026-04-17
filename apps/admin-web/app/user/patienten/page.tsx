"use client";

import PatientList from "@/components/patient-list";

export default function UserPatientenPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur sm:rounded-3xl sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Meine Patienten
        </h1>
        <p className="mt-1 text-xs text-slate-600 sm:text-sm">
          Deine zugewiesenen Patienten aus Patti mit Reststunden und Details.
        </p>
      </div>
      <PatientList />
    </div>
  );
}
