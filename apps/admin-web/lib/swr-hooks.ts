"use client";

import useSWR, { SWRConfiguration } from "swr";
import { fetchWithRefresh, buildHeaders, API_BASE_URL } from "@/lib/api-helpers";

const defaultOpts: SWRConfiguration = {
  revalidateOnFocus: false,
  dedupingInterval: 30_000,
  errorRetryCount: 2,
};

async function apiFetcher<T>(url: string): Promise<T> {
  const res = await fetchWithRefresh(url, { headers: buildHeaders() });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function useUsers() {
  return useSWR<import("@/lib/api").User[]>(
    `${API_BASE_URL}/admin/users`,
    apiFetcher,
    { ...defaultOpts, dedupingInterval: 60_000 }
  );
}

export function useVacationRequests(status?: string) {
  const url = new URL(`${API_BASE_URL}/admin/vacation-requests`);
  if (status) url.searchParams.set("status", status);
  return useSWR<import("@/lib/api").VacationRequest[]>(
    url.toString(),
    apiFetcher,
    defaultOpts
  );
}

export function useSickLeaves(status?: string) {
  const url = new URL(`${API_BASE_URL}/admin/sick-leaves`);
  if (status) url.searchParams.set("status", status);
  return useSWR<import("@/lib/api").SickLeave[]>(
    url.toString(),
    apiFetcher,
    defaultOpts
  );
}

export function useHrRequests(status?: string) {
  const url = new URL(`${API_BASE_URL}/admin/hr-requests`);
  if (status) url.searchParams.set("status", status);
  return useSWR<import("@/lib/api").HrRequestRecord[]>(
    url.toString(),
    apiFetcher,
    defaultOpts
  );
}

export function useAnnouncements() {
  return useSWR<import("@/lib/api").AdminAnnouncement[]>(
    `${API_BASE_URL}/admin/announcements`,
    apiFetcher,
    defaultOpts
  );
}

export function useMailEntries(status?: string) {
  const url = new URL(`${API_BASE_URL}/admin/mail-intake`);
  if (status) url.searchParams.set("status", status);
  return useSWR<import("@/lib/api").MailEntryRecord[]>(
    url.toString(),
    apiFetcher,
    defaultOpts
  );
}

export function usePayrollEntries(month?: string) {
  const url = new URL(`${API_BASE_URL}/admin/payroll`);
  if (month) url.searchParams.set("month", month);
  return useSWR<import("@/lib/api").PayrollEntryRecord[]>(
    url.toString(),
    apiFetcher,
    defaultOpts
  );
}

export function usePatients() {
  return useSWR<import("@/lib/api").Patient[]>(
    `${API_BASE_URL}/admin/patients`,
    apiFetcher,
    { ...defaultOpts, dedupingInterval: 120_000 }
  );
}
