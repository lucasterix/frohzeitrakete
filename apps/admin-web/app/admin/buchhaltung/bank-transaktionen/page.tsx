export default function BankTransaktionenPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">Bank-Transaktionen</h2>
      <p className="text-sm text-slate-600">
        Automatischer Abruf der Bank-Transaktionen, Pending-Queue für Auto-Buchungen,
        Regel-Editor (z. B. IBAN + Verwendungszweck-Pattern → Konto/Kostenstelle).
      </p>
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
        Kommt in Phase 2 — Bank-API-Anbindung (HBCI/FinTS oder PSD2-Provider).
      </div>
    </div>
  );
}
