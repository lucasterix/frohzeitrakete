"use client";

import { ReactNode, useState } from "react";

// Shared employee-onboarding form. Used in two places:
//   1. Admin "+ Neuer Mitarbeiter" modal (POST /datev/employees)
//   2. Public onboarding page (POST /onboarding/{token})
// Both backends consume the same JSON schema, so this single
// component centralises the field definitions + validation.

export type OnboardingPayload = {
  personal: {
    first_name: string;
    surname: string;
    date_of_birth: string;
    place_of_birth?: string;
    sex: "female" | "male" | "non_binary" | "indeterminate";
    nationality: string;
    marital_status?: string;
    social_security_number?: string;
  };
  address: {
    street: string;
    house_number: string;
    postal_code: string;
    city: string;
    country: string;
    address_affix?: string;
  };
  bank: { iban: string; bic?: string };
  tax: {
    tax_class: number;
    child_tax_allowances?: number;
    denomination?: string;
    tax_identification_number?: string;
  };
  social_insurance: {
    company_number_of_health_insurer?: number;
    health_insurer_name?: string;
  };
  employment: {
    date_of_commencement: string;
    job_title?: string;
    weekly_working_hours: number;
    contractual_structure: string;
    employee_type: string;
    activity_type: string;
  };
  contact: {
    mobile_number?: string;
    phone_number?: string;
    email?: string;
  };
};

export function emptyPayload(prefill?: Partial<{
  first_name: string; surname: string; email: string;
}>): OnboardingPayload {
  return {
    personal: {
      first_name: prefill?.first_name ?? "",
      surname: prefill?.surname ?? "",
      date_of_birth: "",
      place_of_birth: "",
      sex: "indeterminate",
      nationality: "000",
      marital_status: "",
      social_security_number: "",
    },
    address: {
      street: "",
      house_number: "",
      postal_code: "",
      city: "",
      country: "D",
      address_affix: "",
    },
    bank: { iban: "", bic: "" },
    tax: {
      tax_class: 1,
      child_tax_allowances: 0,
      denomination: "",
      tax_identification_number: "",
    },
    social_insurance: {
      company_number_of_health_insurer: undefined,
      health_insurer_name: "",
    },
    employment: {
      date_of_commencement: new Date().toISOString().slice(0, 10),
      job_title: "",
      weekly_working_hours: 40,
      contractual_structure: "unbefristet_in_vollzeit",
      employee_type: "101",
      activity_type: "angestellter",
    },
    contact: {
      mobile_number: prefill?.email ? "" : "",
      phone_number: "",
      email: prefill?.email ?? "",
    },
  };
}

const inputCls =
  "w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";

function Field({ label, required, children, hint }: {
  label: string; required?: boolean; children: ReactNode; hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-700">
        {label}
        {required ? <span className="ml-0.5 text-red-600">*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="border-b border-slate-200 pb-1 text-sm font-semibold text-slate-900">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

export function OnboardingForm({
  payload,
  onChange,
  submitLabel,
  onSubmit,
  saving,
  error,
}: {
  payload: OnboardingPayload;
  onChange: (p: OnboardingPayload) => void;
  submitLabel: string;
  onSubmit: () => void;
  saving: boolean;
  error?: string | null;
}) {
  const set = (path: string, value: unknown) => {
    const [section, key] = path.split(".");
    onChange({
      ...payload,
      [section]: { ...(payload as Record<string, Record<string, unknown>>)[section], [key]: value },
    });
  };

  // Minimal validation: all required fields filled?
  const missing: string[] = [];
  if (!payload.personal.first_name) missing.push("Vorname");
  if (!payload.personal.surname) missing.push("Nachname");
  if (!payload.personal.date_of_birth) missing.push("Geburtsdatum");
  if (!payload.address.street) missing.push("Straße");
  if (!payload.address.house_number) missing.push("Hausnummer");
  if (!payload.address.postal_code) missing.push("PLZ");
  if (!payload.address.city) missing.push("Ort");
  if (!payload.bank.iban) missing.push("IBAN");
  if (!payload.employment.date_of_commencement) missing.push("Eintrittsdatum");
  if (!payload.employment.weekly_working_hours) missing.push("Wochenstunden");
  const valid = missing.length === 0;

  return (
    <div className="space-y-6">
      <Section title="Persönliche Daten">
        <Field label="Vorname" required>
          <input
            value={payload.personal.first_name}
            onChange={(e) => set("personal.first_name", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Nachname" required>
          <input
            value={payload.personal.surname}
            onChange={(e) => set("personal.surname", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Geburtsdatum" required>
          <input
            type="date"
            value={payload.personal.date_of_birth}
            onChange={(e) => set("personal.date_of_birth", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Geburtsort">
          <input
            value={payload.personal.place_of_birth ?? ""}
            onChange={(e) => set("personal.place_of_birth", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Geschlecht">
          <select
            value={payload.personal.sex}
            onChange={(e) => set("personal.sex", e.target.value)}
            className={inputCls}
          >
            <option value="indeterminate">unbestimmt</option>
            <option value="female">weiblich</option>
            <option value="male">männlich</option>
            <option value="non_binary">divers</option>
          </select>
        </Field>
        <Field label="Familienstand">
          <select
            value={payload.personal.marital_status ?? ""}
            onChange={(e) => set("personal.marital_status", e.target.value)}
            className={inputCls}
          >
            <option value="">—</option>
            <option value="single">ledig</option>
            <option value="married">verheiratet</option>
            <option value="divorced">geschieden</option>
            <option value="widowed">verwitwet</option>
            <option value="permanently_seperated">dauernd getrennt</option>
            <option value="civil_union">eingetragene Lebenspartnerschaft</option>
          </select>
        </Field>
        <Field label="Staatsangehörigkeit (3-stellig)" hint="ISO/ITSG-Code, z.B. 000=deutsch">
          <input
            value={payload.personal.nationality}
            onChange={(e) => set("personal.nationality", e.target.value)}
            className={`${inputCls} font-mono`}
          />
        </Field>
        <Field label="Sozialversicherungsnummer" hint="z.B. 12345678A123">
          <input
            value={payload.personal.social_security_number ?? ""}
            onChange={(e) => set("personal.social_security_number", e.target.value)}
            className={`${inputCls} font-mono`}
          />
        </Field>
      </Section>

      <Section title="Adresse">
        <Field label="Straße" required>
          <input
            value={payload.address.street}
            onChange={(e) => set("address.street", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Hausnummer" required>
          <input
            value={payload.address.house_number}
            onChange={(e) => set("address.house_number", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="PLZ" required>
          <input
            value={payload.address.postal_code}
            onChange={(e) => set("address.postal_code", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Ort" required>
          <input
            value={payload.address.city}
            onChange={(e) => set("address.city", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Adresszusatz">
          <input
            value={payload.address.address_affix ?? ""}
            onChange={(e) => set("address.address_affix", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Land">
          <input
            value={payload.address.country}
            onChange={(e) => set("address.country", e.target.value)}
            className={`${inputCls} font-mono`}
          />
        </Field>
      </Section>

      <Section title="Bankverbindung">
        <Field label="IBAN" required>
          <input
            value={payload.bank.iban}
            onChange={(e) => set("bank.iban", e.target.value.toUpperCase())}
            className={`${inputCls} font-mono`}
          />
        </Field>
        <Field label="BIC">
          <input
            value={payload.bank.bic ?? ""}
            onChange={(e) => set("bank.bic", e.target.value.toUpperCase())}
            className={`${inputCls} font-mono`}
          />
        </Field>
      </Section>

      <Section title="Steuer">
        <Field label="Steuerklasse" required>
          <select
            value={payload.tax.tax_class}
            onChange={(e) => set("tax.tax_class", Number(e.target.value))}
            className={inputCls}
          >
            {[1, 2, 3, 4, 5, 6].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kinderfreibeträge">
          <input
            type="number"
            step="0.5"
            min="0"
            max="20"
            value={payload.tax.child_tax_allowances ?? ""}
            onChange={(e) => set("tax.child_tax_allowances", Number(e.target.value) || 0)}
            className={inputCls}
          />
        </Field>
        <Field label="Konfession">
          <select
            value={payload.tax.denomination ?? ""}
            onChange={(e) => set("tax.denomination", e.target.value)}
            className={inputCls}
          >
            <option value="">keine</option>
            <option value="rk">rk – römisch-katholisch</option>
            <option value="ev">ev – evangelisch</option>
            <option value="ak">ak – altkatholisch</option>
            <option value="jue_juedisch">jüdisch</option>
          </select>
        </Field>
        <Field label="Steuer-Identifikationsnummer">
          <input
            value={payload.tax.tax_identification_number ?? ""}
            onChange={(e) => set("tax.tax_identification_number", e.target.value)}
            className={`${inputCls} font-mono`}
          />
        </Field>
      </Section>

      <Section title="Sozialversicherung / Krankenkasse">
        <Field label="Krankenkassen-Betriebsnummer" hint="z.B. 29720865 (AOK Niedersachsen)">
          <input
            type="number"
            value={payload.social_insurance.company_number_of_health_insurer ?? ""}
            onChange={(e) =>
              set(
                "social_insurance.company_number_of_health_insurer",
                e.target.value ? Number(e.target.value) : undefined
              )
            }
            className={`${inputCls} font-mono`}
          />
        </Field>
        <Field label="Krankenkasse (Klartext)">
          <input
            value={payload.social_insurance.health_insurer_name ?? ""}
            onChange={(e) => set("social_insurance.health_insurer_name", e.target.value)}
            className={inputCls}
          />
        </Field>
      </Section>

      <Section title="Beschäftigung">
        <Field label="Eintrittsdatum" required>
          <input
            type="date"
            value={payload.employment.date_of_commencement}
            onChange={(e) => set("employment.date_of_commencement", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Wochenstunden" required>
          <input
            type="number"
            step="0.5"
            min="0"
            max="60"
            value={payload.employment.weekly_working_hours}
            onChange={(e) =>
              set("employment.weekly_working_hours", Number(e.target.value) || 0)
            }
            className={inputCls}
          />
        </Field>
        <Field label="Tätigkeit">
          <input
            value={payload.employment.job_title ?? ""}
            onChange={(e) => set("employment.job_title", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Vertragsform">
          <select
            value={payload.employment.contractual_structure}
            onChange={(e) => set("employment.contractual_structure", e.target.value)}
            className={inputCls}
          >
            <option value="unbefristet_in_vollzeit">unbefristet Vollzeit</option>
            <option value="unbefristet_in_teilzeit">unbefristet Teilzeit</option>
            <option value="befristet_in_vollzeit">befristet Vollzeit</option>
            <option value="befristet_in_teilzeit">befristet Teilzeit</option>
          </select>
        </Field>
        <Field label="Personengruppen-Schlüssel">
          <select
            value={payload.employment.employee_type}
            onChange={(e) => set("employment.employee_type", e.target.value)}
            className={inputCls}
          >
            <option value="101">101 – sozialversicherungspflichtig</option>
            <option value="109">109 – geringfügig (Mini-Job)</option>
            <option value="110">110 – kurzfristig</option>
            <option value="190">190 – Praktikant</option>
          </select>
        </Field>
        <Field label="Arbeitnehmer-Typ">
          <select
            value={payload.employment.activity_type}
            onChange={(e) => set("employment.activity_type", e.target.value)}
            className={inputCls}
          >
            <option value="angestellter">Angestellter</option>
            <option value="arbeiter">Arbeiter</option>
            <option value="auszubildender_kaufmaennisch">Azubi (kaufmännisch)</option>
            <option value="auszubildender_gewerblich">Azubi (gewerblich)</option>
          </select>
        </Field>
      </Section>

      <Section title="Kontakt">
        <Field label="Mobil">
          <input
            type="tel"
            value={payload.contact.mobile_number ?? ""}
            onChange={(e) => set("contact.mobile_number", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Telefon">
          <input
            type="tel"
            value={payload.contact.phone_number ?? ""}
            onChange={(e) => set("contact.phone_number", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="E-Mail">
          <input
            type="email"
            value={payload.contact.email ?? ""}
            onChange={(e) => set("contact.email", e.target.value)}
            className={inputCls}
          />
        </Field>
      </Section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-slate-200 pt-4">
        <span className="text-xs text-slate-500">
          {valid ? "Bereit zum Absenden." : `Pflichtfelder fehlen: ${missing.join(", ")}`}
        </span>
        <button
          onClick={onSubmit}
          disabled={!valid || saving}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Speichere …" : submitLabel}
        </button>
      </div>
    </div>
  );
}
