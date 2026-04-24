"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, getMe } from "@/lib/api";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";
import { AlertCircleIcon, CheckCircleIcon } from "@/components/icons";

type Config = {
  // Stammdaten
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  ik: string;
  kim_adresse: string;
  // Abrechnung
  bundesland: string;
  abrechnungscode: string;
  tarifkennzeichen: string;
  verfahrenskennung: string;
  ust_pflichtig: boolean;
  ust_satz: string;
  uebermittlungsmedium: string;
  zeichensatz: string;
  // AUF
  verfahren_spezifikation: string;
  komprimierung: string;
  verschluesselungsart: string;
  elektronische_unterschrift: string;
  max_wiederholungen: string;
  uebertragungsweg: string;
  // SMTP
  smtp_server: string;
  smtp_port: string;
  smtp_user: string;
  smtp_password: string;
  smtp_use_tls: boolean;
  // E-Mail
  email_absender: string;
  kontakt_person: string;
  kontakt_telefon: string;
  kontakt_fax: string;
  // Bank
  bank_name: string;
  bank_iban: string;
  bank_bic: string;
};

const defaultConfig: Config = {
  name: "",
  strasse: "",
  plz: "",
  ort: "",
  ik: "",
  kim_adresse: "",
  bundesland: "",
  abrechnungscode: "19",
  tarifkennzeichen: "",
  verfahrenskennung: "TPFL0",
  ust_pflichtig: true,
  ust_satz: "19",
  uebermittlungsmedium: "2",
  zeichensatz: "I8",
  verfahren_spezifikation: "",
  komprimierung: "00",
  verschluesselungsart: "02",
  elektronische_unterschrift: "00",
  max_wiederholungen: "01",
  uebertragungsweg: "5",
  smtp_server: "",
  smtp_port: "",
  smtp_user: "",
  smtp_password: "",
  smtp_use_tls: true,
  email_absender: "",
  kontakt_person: "",
  kontakt_telefon: "",
  kontakt_fax: "",
  bank_name: "",
  bank_iban: "",
  bank_bic: "",
};

export default function EinstellungenPage() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);
  const [cfg, setCfg] = useState<Config>(defaultConfig);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setError("");
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/pflegehilfsmittel/config`,
        { headers: buildHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setCfg({ ...defaultConfig, ...data });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
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

  function update<K extends keyof Config>(key: K, value: Config[K]) {
    setCfg((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[0-9]{9}$/.test(cfg.ik)) {
      setError("Leistungserbringer-IK muss genau 9 Ziffern haben.");
      return;
    }
    setSaving(true);
    setError("");
    setFlash("");
    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/admin/pflegehilfsmittel/config`,
        {
          method: "POST",
          headers: { ...buildHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(cfg),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Speichern fehlgeschlagen");
      }
      setFlash("Konfiguration erfolgreich gespeichert!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";
  const labelCls = "mb-1 block text-xs font-medium text-slate-600";
  const hintCls = "mt-0.5 text-[11px] text-slate-400";

  if (booting) return <div className="h-64 animate-pulse rounded-3xl bg-white/60" />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Pflegehilfsmittel
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
          Konfiguration Leistungserbringer
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Stammdaten, Abrechnungseinstellungen, AUF-Parameter und SMTP-Zugang verwalten.
        </p>
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

      <form onSubmit={handleSave}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left column */}
          <div className="space-y-6">
            {/* Stammdaten */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-lg font-semibold text-slate-900">Stammdaten</h2>
              <p className="mb-4 text-sm text-slate-500">
                Grunddaten deines Betriebs, wie sie in XML und Rechnungen erscheinen.
              </p>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Name des Betriebs</label>
                  <input type="text" value={cfg.name} onChange={(e) => update("name", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Strasse</label>
                  <input type="text" value={cfg.strasse} onChange={(e) => update("strasse", e.target.value)} className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>PLZ</label>
                    <input type="text" value={cfg.plz} onChange={(e) => update("plz", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Ort</label>
                    <input type="text" value={cfg.ort} onChange={(e) => update("ort", e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Leistungserbringer-IK (9-stellig, nur Ziffern) *</label>
                  <input
                    type="text"
                    value={cfg.ik}
                    onChange={(e) => update("ik", e.target.value.replace(/[^0-9]/g, "").slice(0, 9))}
                    required
                    maxLength={9}
                    pattern="[0-9]{9}"
                    className={`${inputCls} ${cfg.ik.length === 9 ? "border-emerald-400 bg-emerald-50/30" : cfg.ik.length > 0 ? "border-red-300 bg-red-50/30" : ""}`}
                  />
                  <p className={hintCls}>Das Institutionskennzeichen muss genau 9 Ziffern haben (z.B. 023134512).</p>
                </div>
                <div>
                  <label className={labelCls}>KIM-/Absenderadresse</label>
                  <input type="email" value={cfg.kim_adresse} onChange={(e) => update("kim_adresse", e.target.value)} placeholder="z.B. abrechnung@deinbetrieb.de" className={inputCls} />
                </div>
              </div>
            </section>

            {/* Abrechnung */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-lg font-semibold text-slate-900">Abrechnung</h2>
              <p className="mb-4 text-sm text-slate-500">Einstellungen fuer TA3, Tarifkennzeichen und Steuer.</p>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Bundesland</label>
                  <select value={cfg.bundesland} onChange={(e) => update("bundesland", e.target.value)} className={inputCls}>
                    <option value="">-- bitte waehlen --</option>
                    <option value="NI">Niedersachsen</option>
                    <option value="NW">Nordrhein-Westfalen</option>
                    <option value="BY">Bayern</option>
                    <option value="BE">Berlin</option>
                    <option value="BW">Baden-Wuerttemberg</option>
                    <option value="HE">Hessen</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Abrechnungscode (TA3, z.B. 19)</label>
                  <input type="text" value={cfg.abrechnungscode} onChange={(e) => update("abrechnungscode", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Tarifkennzeichen (TA3, 5-stellig)</label>
                  <select value={cfg.tarifkennzeichen} onChange={(e) => update("tarifkennzeichen", e.target.value)} className={inputCls}>
                    <option value="">-- automatisch aus Bundesland --</option>
                    <option value="01000">01000 - Baden-Wuerttemberg</option>
                    <option value="02000">02000 - Bayern</option>
                    <option value="06000">06000 - Hessen</option>
                    <option value="07000">07000 - Niedersachsen</option>
                    <option value="08000">08000 - Nordrhein-Westfalen</option>
                    <option value="23000">23000 - Berlin</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Verfahrenskennung</label>
                  <select value={cfg.verfahrenskennung} onChange={(e) => update("verfahrenskennung", e.target.value)} className={inputCls}>
                    <option value="TPFL0">TPFL0 (Test)</option>
                    <option value="EPFL0">EPFL0 (Echt)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Umsatzsteuer berechnen?</label>
                    <select
                      value={cfg.ust_pflichtig ? "ja" : "nein"}
                      onChange={(e) => update("ust_pflichtig", e.target.value === "ja")}
                      className={inputCls}
                    >
                      <option value="nein">Nein</option>
                      <option value="ja">Ja</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>USt-Satz (%)</label>
                    <input type="text" value={cfg.ust_satz} onChange={(e) => update("ust_satz", e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Uebermittlungsmedium</label>
                  <select value={cfg.uebermittlungsmedium} onChange={(e) => update("uebermittlungsmedium", e.target.value)} className={inputCls}>
                    <option value="2">2 - E-Mail (SMTP) nach Anlage 7</option>
                    <option value="1">1 - DFUE / KIM (nicht genutzt)</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Zeichensatz</label>
                  <select value={cfg.zeichensatz} onChange={(e) => update("zeichensatz", e.target.value)} className={inputCls}>
                    <option value="I8">UTF-8 (I8)</option>
                    <option value="I1">ISO-8859-1 (I1)</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Bankverbindung */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-lg font-semibold text-slate-900">Bankverbindung</h2>
              <p className="mb-4 text-sm text-slate-500">Erscheint in der Fusszeile der Rechnung.</p>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Bankname</label>
                  <input type="text" value={cfg.bank_name} onChange={(e) => update("bank_name", e.target.value)} placeholder="z.B. Musterbank" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>IBAN</label>
                  <input type="text" value={cfg.bank_iban} onChange={(e) => update("bank_iban", e.target.value)} placeholder="z.B. DE12 3456 7890 1234 5678 90" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>BIC</label>
                  <input type="text" value={cfg.bank_bic} onChange={(e) => update("bank_bic", e.target.value)} placeholder="z.B. GENODEF1XXX" className={inputCls} />
                </div>
              </div>
            </section>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* AUF-Details */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-lg font-semibold text-slate-900">AUF-Details</h2>
              <p className="mb-4 text-sm text-slate-500">Technische Parameter fuer den AUF-Uebertragungsweg.</p>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Verfahrensspezifikation (optional)</label>
                  <input type="text" value={cfg.verfahren_spezifikation} onChange={(e) => update("verfahren_spezifikation", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Komprimierung</label>
                  <select value={cfg.komprimierung} onChange={(e) => update("komprimierung", e.target.value)} className={inputCls}>
                    <option value="00">00 - keine</option>
                    <option value="02">02 - gzip</option>
                    <option value="03">03 - ZIP</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Verschluesselungsart</label>
                  <select value={cfg.verschluesselungsart} onChange={(e) => update("verschluesselungsart", e.target.value)} className={inputCls}>
                    <option value="00">00 - keine Verschluesselung</option>
                    <option value="02">02 - PKCS#7 (E-Mail-Verschluesselung)</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Elektronische Unterschrift (Datei)</label>
                  <select value={cfg.elektronische_unterschrift} onChange={(e) => update("elektronische_unterschrift", e.target.value)} className={inputCls}>
                    <option value="00">00 - keine (Papierunterschrift)</option>
                    <option value="02">02 - PKCS#7 (elektronische Signatur)</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Maximale Wiederholungen (z.B. 01)</label>
                  <input type="text" value={cfg.max_wiederholungen} onChange={(e) => update("max_wiederholungen", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Uebertragungsweg (AUF Feld 230)</label>
                  <select value={cfg.uebertragungsweg} onChange={(e) => update("uebertragungsweg", e.target.value)} className={inputCls}>
                    <option value="5">5 - E-Mail (SMTP) / anderer Weg</option>
                    <option value="1">1 - klassische DFUE (nicht genutzt)</option>
                  </select>
                </div>
              </div>
            </section>

            {/* SMTP */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-lg font-semibold text-slate-900">SMTP / E-Mail</h2>
              <p className="mb-4 text-sm text-slate-500">Zugangsdaten fuer den Versand nach Anlage 7.</p>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>SMTP-Server</label>
                  <input type="text" value={cfg.smtp_server} onChange={(e) => update("smtp_server", e.target.value)} placeholder="z.B. smtp.deinprovider.de" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>SMTP-Port</label>
                  <input type="text" value={cfg.smtp_port} onChange={(e) => update("smtp_port", e.target.value)} placeholder="z.B. 587" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>SMTP-Benutzer</label>
                  <input type="text" value={cfg.smtp_user} onChange={(e) => update("smtp_user", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>SMTP-Passwort</label>
                  <input type="password" value={cfg.smtp_password} onChange={(e) => update("smtp_password", e.target.value)} placeholder="Leer lassen um nicht zu aendern" className={inputCls} />
                  <p className={hintCls}>Leer lassen, um das gespeicherte Passwort nicht zu aendern.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cfg.smtp_use_tls}
                    onChange={(e) => update("smtp_use_tls", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <label className="text-sm text-slate-700">TLS (STARTTLS) verwenden</label>
                </div>
              </div>
            </section>

            {/* E-Mail Absender */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-lg font-semibold text-slate-900">E-Mail-Absender</h2>
              <p className="mb-4 text-sm text-slate-500">Absenderdaten fuer Versand und Rueckfragen.</p>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Absender-E-Mail (FROM)</label>
                  <input type="email" value={cfg.email_absender} onChange={(e) => update("email_absender", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Kontaktperson (optional)</label>
                  <input type="text" value={cfg.kontakt_person} onChange={(e) => update("kontakt_person", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Telefon (optional)</label>
                  <input type="text" value={cfg.kontakt_telefon} onChange={(e) => update("kontakt_telefon", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Fax (optional)</label>
                  <input type="text" value={cfg.kontakt_fax} onChange={(e) => update("kontakt_fax", e.target.value)} className={inputCls} />
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="mt-6">
          <button
            type="submit"
            disabled={saving}
            className="rounded-2xl bg-brand-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? "Speichere..." : "Konfiguration speichern"}
          </button>
        </div>
      </form>
    </div>
  );
}
