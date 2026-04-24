export default function MitarbeiterPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">Mitarbeiter &amp; Lohn</h2>
      <p className="text-sm text-slate-600">
        Alle aktiven Mitarbeiter aus FrohZeitRakete, Stunden pro Monat und Gehalt pflegen,
        Synchronisation zu DATEV Lohn+Gehalt via ASCII-Import, Patti-Abgleich.
      </p>
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
        Kommt in Phase 1 — Mitarbeiter-Stammdaten &amp; DATEV Lohn+Gehalt Export.
      </div>
    </div>
  );
}
