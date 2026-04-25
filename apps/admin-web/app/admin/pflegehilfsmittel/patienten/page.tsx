"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, getMe } from "@/lib/api";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";
import { AlertCircleIcon, CheckCircleIcon, RefreshIcon } from "@/components/icons";

type Kostentraeger = {
  id: number;
  name: string;
  ik: string;
};

type Patient = {
  id: number;
  name: string;
  versichertennummer: string;
  geburtsdatum: string | null;
  address: string;
  kasse_id: number | null;
  kasse_name: string | null;
  unterschriebener_antrag: boolean;
};

export default function PatientenPage() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [kassen, setKassen] = useState<Kostentraeger[]>([]);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Create form
  const [formName, setFormName] = useState("");
  const [formVsnr, setFormVsnr] = useState("");
  const [formGebdat, setFormGebdat] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formKasseId, setFormKasseId] = useState<number | "">("");

  // Edit modal
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [editName, setEditName] = useState("");
  const [editVsnr, setEditVsnr] = useState("");
  const [editGebdat, setEditGebdat] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editKasseId, setEditKasseId] = useState<number | "">("");

  // Delete modal
  const [deletePatient, setDeletePatient] = useState<Patient | null>(null);

  // PDF import
  const [importing, setImporting] = useState(false);

  const loadData = useCallback(async () => {
    setError("");
    try {
      const [pRes, kRes] = await Promise.all([
        fetchWithRefresh(`${API_BASE_URL}/admin/pflegehilfsmittel/patients`, {
          headers: buildHeaders(),
        }),
        fetchWithRefresh(`${API_BASE_URL}/admin/pflegehilfsmittel/kostentraeger`, {
          headers: buildHeaders(),
        }),
      ]);
      if (pRes.ok) setPatients(await pRes.json());
      else throw new Error("Fehler beim Laden der Patienten");
      if (kRes.ok) setKassen(await kRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    }
  }, []);

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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) {
      setError("Name ist erforderlich");
      return;
    }
    if (!formKasseId) {
      setError("Bitte eine Pflegekasse auswaehlen");
      return;
    }
    setSaving(true);
    setError("");
    setFlash("");
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/pflegehilfsmittel/patients`,
        {
          method: "POST",
          headers: { ...buildHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName.trim(),
            versichertennummer: formVsnr.trim(),
            geburtsdatum: formGebdat || null,
            address: formAddress.trim(),
            kasse_id: formKasseId,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Speichern fehlgeschlagen");
      }
      setFlash("Patient erfolgreich angelegt!");
      setFormName("");
      setFormVsnr("");
      setFormGebdat("");
      setFormAddress("");
      setFormKasseId("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(p: Patient) {
    setEditPatient(p);
    setEditName(p.name);
    setEditVsnr(p.versichertennummer);
    setEditGebdat(p.geburtsdatum || "");
    setEditAddress(p.address || "");
    setEditKasseId(p.kasse_id || "");
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editPatient) return;
    setSaving(true);
    setError("");
    setFlash("");
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/pflegehilfsmittel/patients/${editPatient.id}`,
        {
          method: "PUT",
          headers: { ...buildHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editName.trim(),
            versichertennummer: editVsnr.trim(),
            geburtsdatum: editGebdat || null,
            address: editAddress.trim(),
            kasse_id: editKasseId || null,
          }),
        }
      );
      if (!res.ok) throw new Error("Speichern fehlgeschlagen");
      setFlash("Patient aktualisiert!");
      setEditPatient(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletePatient) return;
    setBusyId(deletePatient.id);
    setError("");
    setFlash("");
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/pflegehilfsmittel/patients/${deletePatient.id}`,
        { method: "DELETE", headers: buildHeaders() }
      );
      if (!res.ok) throw new Error("Loeschen fehlgeschlagen");
      setFlash(`Patient "${deletePatient.name}" geloescht.`);
      setDeletePatient(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAntragUpload(patientId: number, file: File) {
    setBusyId(patientId);
    setError("");
    try {
      const fd = new FormData();
      fd.append("antrag_pdf", file);
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/pflegehilfsmittel/patients/${patientId}/antrag_upload`,
        { method: "POST", body: fd }
      );
      if (!res.ok) throw new Error("Upload fehlgeschlagen");
      setFlash("Antrag erfolgreich hochgeladen!");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusyId(null);
    }
  }

  async function handlePdfImport(file: File) {
    setImporting(true);
    setError("");
    setFlash("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/pflegehilfsmittel/patients/parse-pdf`,
        { method: "POST", body: fd }
      );
      if (!res.ok) throw new Error("PDF-Analyse fehlgeschlagen");
      const data = await res.json();
      if (data.name) setFormName(data.name);
      if (data.versichertennummer) setFormVsnr(data.versichertennummer);
      if (data.geburtsdatum) {
        // Convert DD.MM.YYYY to YYYY-MM-DD for date input
        const parts = data.geburtsdatum.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        if (parts) {
          setFormGebdat(`${parts[3]}-${parts[2]}-${parts[1]}`);
        } else {
          setFormGebdat(data.geburtsdatum);
        }
      }
      setFlash("Daten aus PDF uebernommen! Bitte pruefen und ergaenzen.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Import");
    } finally {
      setImporting(false);
    }
  }

  const filtered = patients.filter((p) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    const text = `${p.name} ${p.versichertennummer} ${p.address || ""} ${p.kasse_name || ""}`.toLowerCase();
    return text.includes(q);
  });

  function formatDate(d: string | null) {
    if (!d) return "\u2014";
    try {
      return new Date(d).toLocaleDateString("de-DE");
    } catch {
      return d;
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
              Patienten
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Patienten verwalten, aus PDF uebernehmen und Antraege vorbereiten.
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

      {/* Neuen Patienten anlegen */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Neue/n Patient/in anlegen</h2>
        <p className="mb-4 text-sm text-slate-500">
          Daten manuell eingeben. Pflichtfelder sind mit * markiert.
        </p>

        <form onSubmit={handleCreate}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Name *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Vor- und Nachname"
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Versichertennr. *</label>
              <input
                type="text"
                value={formVsnr}
                onChange={(e) => setFormVsnr(e.target.value)}
                placeholder="z.B. A123456789"
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Geburtsdatum</label>
              <input
                type="date"
                value={formGebdat}
                onChange={(e) => setFormGebdat(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Pflegekasse *</label>
              <select
                value={formKasseId}
                onChange={(e) => setFormKasseId(e.target.value ? Number(e.target.value) : "")}
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Bitte waehlen...</option>
                {kassen.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.ik})
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Anschrift</label>
              <textarea
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                rows={2}
                placeholder="Strasse, PLZ Ort"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? "Speichere..." : "Patient speichern"}
            </button>
            <label className="cursor-pointer rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              {importing ? "Analysiere PDF..." : "Aus PDF importieren"}
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={importing}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePdfImport(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </form>
      </section>

      {/* Patientenliste */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Bestehende Patienten</h2>
            <p className="text-sm text-slate-500">{patients.length} Patienten gespeichert</p>
          </div>
          {patients.length > 0 && (
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtern..."
              className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm sm:w-64 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
            {patients.length === 0
              ? "Noch keine Patienten angelegt."
              : "Keine Patienten fuer diesen Filter."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Versichertennr.</th>
                  <th className="px-3 py-3">Geburtsdatum</th>
                  <th className="px-3 py-3">Pflegekasse</th>
                  <th className="px-3 py-3">Antrag</th>
                  <th className="px-3 py-3">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-medium text-slate-900">{p.name}</td>
                    <td className="px-3 py-3 text-slate-600">{p.versichertennummer}</td>
                    <td className="px-3 py-3 text-slate-600">{formatDate(p.geburtsdatum)}</td>
                    <td className="px-3 py-3 text-slate-600">{p.kasse_name ?? "\u2014"}</td>
                    <td className="px-3 py-3">
                      {p.unterschriebener_antrag ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                          Vorhanden
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                          Fehlt
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          Bearbeiten
                        </button>
                        <button
                          onClick={() =>
                            window.open(
                              `${API_BASE_URL}/admin/pflegehilfsmittel/patients/${p.id}/pflegeantrag.pdf`,
                              "_blank"
                            )
                          }
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          Pflegeantrag PDF
                        </button>
                        <button
                          onClick={() =>
                            window.open(
                              `${API_BASE_URL}/admin/pflegehilfsmittel/patients/${p.id}/unterschrift-eins.pdf`,
                              "_blank"
                            )
                          }
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          Unterschrift PDF
                        </button>
                        <button
                          onClick={() =>
                            window.open(
                              `${API_BASE_URL}/admin/pflegehilfsmittel/patients/${p.id}/antrag-komplett.pdf`,
                              "_blank"
                            )
                          }
                          className="rounded-lg border border-brand-200 bg-brand-50 px-2 py-1 text-xs text-brand-700 hover:bg-brand-100"
                        >
                          Antrag Komplett
                        </button>
                        <label className="cursor-pointer rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50">
                          Antrag hochladen
                          <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleAntragUpload(p.id, file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {p.unterschriebener_antrag && (
                          <>
                            <button
                              onClick={() =>
                                window.open(
                                  `${API_BASE_URL}/admin/pflegehilfsmittel/patients/${p.id}/antrag-download`,
                                  "_blank"
                                )
                              }
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
                            >
                              Antrag ansehen
                            </button>
                            <button
                              onClick={() =>
                                window.open(
                                  `${API_BASE_URL}/admin/pflegehilfsmittel/patients/${p.id}/antrag-final.pdf`,
                                  "_blank"
                                )
                              }
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
                            >
                              Antrag Final
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setDeletePatient(p)}
                          disabled={busyId === p.id}
                          className="rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          Loeschen
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Edit Modal */}
      {editPatient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditPatient(null);
          }}
        >
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Patient bearbeiten</h3>
              <button
                onClick={() => setEditPatient(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleUpdate} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Versichertennr.</label>
                <input
                  type="text"
                  value={editVsnr}
                  onChange={(e) => setEditVsnr(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Geburtsdatum</label>
                <input
                  type="date"
                  value={editGebdat}
                  onChange={(e) => setEditGebdat(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Anschrift</label>
                <textarea
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Pflegekasse</label>
                <select
                  value={editKasseId}
                  onChange={(e) => setEditKasseId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Bitte waehlen...</option>
                  {kassen.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name} ({k.ik})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditPatient(null)}
                  className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-2xl bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {saving ? "Speichere..." : "Speichern"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deletePatient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeletePatient(null);
          }}
        >
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-slate-900">Patient loeschen</h3>
            <p className="mb-1 text-sm text-slate-600">
              Soll der Patient &bdquo;{deletePatient.name}&ldquo; wirklich geloescht werden?
            </p>
            <p className="mb-4 text-xs text-slate-500">
              Bereits erzeugte Abrechnungen bleiben im Archiv, sind aber nicht mehr mit diesem
              Patienten verknuepft.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeletePatient(null)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDelete}
                disabled={busyId === deletePatient.id}
                className="rounded-2xl bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                Ja, loeschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
