const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.froehlichdienste.de";

/* =========================
   TYPES
========================= */

export type User = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  patti_person_id: number | null;
  has_company_car?: boolean;
};

export type CreateUserPayload = {
  email: string;
  password: string;
  full_name: string;
  role: string;
  is_active?: boolean;
  patti_person_id?: number | null;
  has_company_car?: boolean;
};

export type UpdateUserPayload = {
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  patti_person_id?: number | null;
  has_company_car?: boolean;
  password?: string | null;
};

export type TravelCostPayment = {
  id: number;
  user_id: number;
  from_date: string;
  to_date: string;
  note: string | null;
  marked_by_user_id: number | null;
  created_at: string;
};

export async function getTravelCostPayments(
  userId: number
): Promise<TravelCostPayment[]> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/users/${userId}/travel-cost-payments`,
    { headers: buildHeaders(), cache: "no-store" }
  );
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Fehler beim Laden der Fahrtkosten")
    );
  }
  return response.json();
}

export async function createTravelCostPayment(
  userId: number,
  payload: { from_date: string; to_date: string; note?: string | null }
): Promise<TravelCostPayment> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/users/${userId}/travel-cost-payments`,
    {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Fahrtkosten konnten nicht markiert werden")
    );
  }
  return response.json();
}

// ==========================================================================
// Office Workflow: Vacation, Sick Leave, HR Requests, Announcements
// ==========================================================================

export type VacationRequest = {
  id: number;
  user_id: number;
  from_date: string;
  to_date: string;
  note: string | null;
  status: string;
  approved_from_date: string | null;
  approved_to_date: string | null;
  handler_user_id: number | null;
  handler_kuerzel: string | null;
  handled_at: string | null;
  response_text: string | null;
  created_at: string;
};

export async function getVacationRequests(
  status?: string
): Promise<VacationRequest[]> {
  const url = new URL(`${API_BASE_URL}/admin/vacation-requests`);
  if (status) url.searchParams.set("status", status);
  const response = await fetchWithRefresh(url.toString(), {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Fehler beim Laden der Urlaubsanträge")
    );
  }
  return response.json();
}

export async function resolveVacationRequest(
  id: number,
  payload: {
    status: "approved" | "partially_approved" | "rejected";
    approved_from_date?: string | null;
    approved_to_date?: string | null;
    response_text?: string | null;
    handler_kuerzel: string;
  }
): Promise<VacationRequest> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/vacation-requests/${id}/resolve`,
    {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Antwort konnte nicht gespeichert werden")
    );
  }
  return response.json();
}

export type SickLeave = {
  id: number;
  user_id: number;
  from_date: string;
  to_date: string;
  note: string | null;
  handler_user_id: number | null;
  handler_kuerzel: string | null;
  acknowledged_at: string | null;
  response_text: string | null;
  created_at: string;
};

export async function getSickLeaves(
  onlyOpen = false
): Promise<SickLeave[]> {
  const url = new URL(`${API_BASE_URL}/admin/sick-leaves`);
  if (onlyOpen) url.searchParams.set("only_open", "true");
  const response = await fetchWithRefresh(url.toString(), {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Fehler beim Laden der Krankmeldungen")
    );
  }
  return response.json();
}

export async function acknowledgeSickLeave(
  id: number,
  payload: { response_text?: string | null; handler_kuerzel: string }
): Promise<SickLeave> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/sick-leaves/${id}/acknowledge`,
    {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Bestätigung fehlgeschlagen")
    );
  }
  return response.json();
}

export type HrRequestRecord = {
  id: number;
  user_id: number;
  category: string;
  subject: string;
  body: string | null;
  status: string;
  handler_user_id: number | null;
  handler_kuerzel: string | null;
  handled_at: string | null;
  response_text: string | null;
  created_at: string;
};

export async function getHrRequests(
  onlyOpen = false
): Promise<HrRequestRecord[]> {
  const url = new URL(`${API_BASE_URL}/admin/hr-requests`);
  if (onlyOpen) url.searchParams.set("only_open", "true");
  const response = await fetchWithRefresh(url.toString(), {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Fehler beim Laden der HR-Anfragen")
    );
  }
  return response.json();
}

export async function resolveHrRequest(
  id: number,
  payload: {
    status: "done" | "rejected";
    response_text?: string | null;
    handler_kuerzel: string;
  }
): Promise<HrRequestRecord> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/hr-requests/${id}/resolve`,
    {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Antwort konnte nicht gespeichert werden")
    );
  }
  return response.json();
}

export type AdminAnnouncement = {
  id: number;
  title: string;
  body: string;
  visible_from: string;
  visible_until: string;
  created_by_user_id: number | null;
  created_at: string;
};

export async function getAnnouncements(
  activeOnly = false
): Promise<AdminAnnouncement[]> {
  const url = new URL(`${API_BASE_URL}/admin/announcements`);
  if (activeOnly) url.searchParams.set("active_only", "true");
  const response = await fetchWithRefresh(url.toString(), {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Fehler beim Laden der Ankündigungen")
    );
  }
  return response.json();
}

export async function createAnnouncement(payload: {
  title: string;
  body: string;
  visible_until: string;
  visible_from?: string | null;
}): Promise<AdminAnnouncement> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/announcements`,
    {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Ankündigung konnte nicht angelegt werden")
    );
  }
  return response.json();
}

export async function deleteAnnouncement(id: number): Promise<void> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/announcements/${id}`,
    { method: "DELETE", headers: buildHeaders() }
  );
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Ankündigung konnte nicht gelöscht werden")
    );
  }
}

export async function deleteTravelCostPayment(id: number): Promise<void> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/travel-cost-payments/${id}`,
    { method: "DELETE", headers: buildHeaders() }
  );
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Fahrtkosten konnten nicht gelöscht werden")
    );
  }
}

export type Patient = {
  service_history_id: number;
  patient_id: number;
  display_name: string;
  first_name?: string | null;
  last_name?: string | null;
  address_line?: string | null;
  city?: string | null;
  care_degree?: string | null;
  active: boolean;
  is_primary: boolean;
  started_at?: string | null;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type AuthResponse = {
  user: User;
};

export type SessionInfo = {
  id: number;
  user_id: number;
  device_label?: string | null;
  user_agent?: string | null;
  ip_address?: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  revoked_at?: string | null;
  is_current: boolean;
};

/* =========================
   SIGNATURE TYPES
========================= */

export type SignatureAsset = {
  id: number;
  svg_content: string;
  width?: number | null;
  height?: number | null;
};

export type SignatureEvent = {
  id: number;
  patient_id: number;
  document_type: string;
  status: string;
  signer_name: string;
  info_text_version?: string | null;
  source: string;
  note?: string | null;
  created_by_user_id?: number | null;
  signed_at: string;
  created_at: string;
  updated_at: string;
  asset?: SignatureAsset | null;
};

export type ActivityFeedItem = {
  id: number;
  event_type: string;
  title: string;
  subtitle: string;
  created_at: string;
  signature_event_id: number;
};

export type DocumentType = "leistungsnachweis" | "vp_antrag" | "pflegeumwandlung";

export type CreateTestSignaturePayload = {
  patient_id: number;
  document_type: DocumentType;
  signer_name: string;
  info_text_version?: string | null;
  svg_content: string;
  width?: number | null;
  height?: number | null;
  note?: string | null;
};

export type CreateMobileSignaturePayload = {
  patient_id: number;
  document_type: DocumentType;
  signer_name: string;
  info_text_version?: string | null;
  svg_content: string;
  width?: number | null;
  height?: number | null;
  note?: string | null;
  signed_at?: string | null; // ISO 8601 — optional, für Offline-Erfassung
};

/* =========================
   HELPERS
========================= */

function getDeviceName(): string {
  if (typeof window === "undefined") return "unknown-device";

  return `${navigator.platform} · ${navigator.userAgent}`.slice(0, 180);
}

function buildHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Device-Name": getDeviceName(),
  };
}

async function parseError(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const data = await response.json();

    if (typeof data?.detail === "string") {
      return data.detail;
    }

    return JSON.stringify(data);
  } catch {
    return fallback;
  }
}

async function fetchWithRefresh(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  let response = await fetch(input, {
    credentials: "include",
    ...init,
  });

  if (response.status !== 401) {
    return response;
  }

  const refreshResponse = await fetch(
    `${API_BASE_URL}/auth/refresh`,
    {
      method: "POST",
      credentials: "include",
      headers: buildHeaders(),
    }
  );

  if (!refreshResponse.ok) {
    return response;
  }

  response = await fetch(input, {
    credentials: "include",
    ...init,
  });

  return response;
}

/* =========================
   AUTH
========================= */

export async function login(
  payload: LoginPayload
): Promise<AuthResponse> {
  const response = await fetch(
    `${API_BASE_URL}/auth/login`,
    {
      method: "POST",
      credentials: "include",
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(response, "Login fehlgeschlagen")
    );
  }

  return response.json();
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: buildHeaders(),
  });
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/auth/change-password`,
    {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(response, "Fehler beim Ändern des Passworts")
    );
  }
}

export async function getMe(): Promise<User> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/auth/me`,
    {
      headers: buildHeaders(),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Laden des Users"
      )
    );
  }

  return response.json();
}

/* =========================
   SESSIONS
========================= */

export async function getMySessions(): Promise<
  SessionInfo[]
> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/auth/sessions`,
    {
      headers: buildHeaders(),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Laden der Sessions"
      )
    );
  }

  return response.json();
}

export async function revokeMySession(
  sessionId: number
): Promise<SessionInfo> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/auth/sessions/${sessionId}/revoke`,
    {
      method: "POST",
      headers: buildHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Widerrufen der Session"
      )
    );
  }

  return response.json();
}

/* =========================
   USERS (ADMIN)
========================= */

export async function getUsers(): Promise<User[]> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/users`,
    {
      headers: buildHeaders(),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Laden der User"
      )
    );
  }

  return response.json();
}

export async function createUser(
  payload: CreateUserPayload
): Promise<User> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/users`,
    {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Erstellen des Users"
      )
    );
  }

  return response.json();
}

export async function updateUser(
  userId: number,
  payload: UpdateUserPayload
): Promise<User> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/users/${userId}`,
    {
      method: "PATCH",
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Aktualisieren des Users"
      )
    );
  }

  return response.json();
}

export async function activateUser(
  userId: number
): Promise<User> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/users/${userId}/activate`,
    {
      method: "POST",
      headers: buildHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Aktivieren des Users"
      )
    );
  }

  return response.json();
}

export async function deactivateUser(
  userId: number
): Promise<User> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/users/${userId}/deactivate`,
    {
      method: "POST",
      headers: buildHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Deaktivieren des Users"
      )
    );
  }

  return response.json();
}

export async function deleteUser(
  userId: number
): Promise<void> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/users/${userId}`,
    {
      method: "DELETE",
      headers: buildHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Löschen des Users"
      )
    );
  }
}

export async function getUserSessions(
  userId: number
): Promise<SessionInfo[]> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/users/${userId}/sessions`,
    {
      headers: buildHeaders(),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Laden der User-Sessions"
      )
    );
  }

  return response.json();
}

export async function revokeUserSession(
  userId: number,
  sessionId: number
): Promise<SessionInfo> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/users/${userId}/sessions/${sessionId}/revoke`,
    {
      method: "POST",
      headers: buildHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Widerrufen der Session"
      )
    );
  }

  return response.json();
}

/* =========================
   PATIENTS (MOBILE)
========================= */

export async function getMyPatients(): Promise<
  Patient[]
> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/mobile/patients`,
    {
      headers: buildHeaders(),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Laden der Patienten"
      )
    );
  }

  return response.json();
}

/* =========================
   SIGNATURES (ADMIN)
========================= */

export async function getSignatures(): Promise<
  SignatureEvent[]
> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/signatures`,
    {
      headers: buildHeaders(),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Laden der Signaturen"
      )
    );
  }

  return response.json();
}

export async function getSignature(
  signatureId: number
): Promise<SignatureEvent> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/signatures/${signatureId}`,
    {
      headers: buildHeaders(),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Laden der Signatur"
      )
    );
  }

  return response.json();
}

export async function getActivityFeed(): Promise<
  ActivityFeedItem[]
> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/activity-feed`,
    {
      headers: buildHeaders(),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Laden des Activity-Feeds"
      )
    );
  }

  return response.json();
}

export async function createTestSignature(
  payload: CreateTestSignaturePayload
): Promise<SignatureEvent> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/test-signatures`,
    {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Speichern der Test-Signatur"
      )
    );
  }

  return response.json();
}

/* =========================
   SIGNATURES (MOBILE)
========================= */

export async function createMobileSignature(
  payload: CreateMobileSignaturePayload
): Promise<SignatureEvent> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/mobile/signatures`,
    {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Speichern der Signatur"
      )
    );
  }

  return response.json();
}

export async function getMyMobileSignatures(): Promise<SignatureEvent[]> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/mobile/signatures`,
    {
      headers: buildHeaders(),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Laden der Signaturen"
      )
    );
  }

  return response.json();
}

export async function getMyMobileSignature(
  signatureId: number
): Promise<SignatureEvent> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/mobile/signatures/${signatureId}`,
    {
      headers: buildHeaders(),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Laden der Signatur"
      )
    );
  }

  return response.json();
}

/* =========================
   WORK REPORT (ADMIN)
========================= */

export type WorkReportEntry = {
  id: number;
  type: "patient" | "office" | "training" | "other";
  patient_id: number | null;
  patient_name: string | null;
  label: string | null;
  hours: number;
  activities: string[];
  note: string | null;
};

export type WorkReportTrip = {
  id: number;
  kind: "start" | "intermediate" | "return";
  from_address: string;
  to_address: string;
  distance_km: number | null;
};

export type WorkReportDay = {
  date: string;
  entries: WorkReportEntry[];
  trips: WorkReportTrip[];
  day_hours: number;
  day_km: number;
  patient_hours?: number;
  non_patient_hours?: number;
  patient_hours_with_bonus?: number;
  travel_costs_paid?: boolean;
};

export type WorkReport = {
  user: {
    id: number;
    email: string;
    full_name: string;
    role: string;
    has_company_car?: boolean;
  };
  year: number;
  month: number;
  total_hours: number;
  total_km: number;
  working_days: number;
  patient_hours?: number;
  non_patient_hours?: number;
  patient_hours_with_bonus?: number;
  billable_hours?: number;
  bonus_pct?: number;
  days: WorkReportDay[];
};

export async function getUserWorkReport(
  userId: number,
  year: number,
  month: number
): Promise<WorkReport> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/users/${userId}/work-report?year=${year}&month=${month}`,
    {
      headers: buildHeaders(),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseError(response, "Fehler beim Laden des Work-Reports")
    );
  }

  return response.json();
}

/* =========================
   ADMIN CALL TASKS
========================= */

export type AdminCallTaskKind =
  | "call_request"
  | "new_caretaker_followup"
  | "half_year_check"
  | "no_invoice_2_months"
  | "missing_emergency_contact"
  | "missing_contract";

export type AdminCallTask = {
  kind: AdminCallTaskKind;
  priority: "high" | "medium" | "low";
  patient_id: number;
  patient_name: string | null;
  title: string;
  subtitle: string;
  created_at: string;
  source_id: number | null;
  requested_by_user_id?: number | null;
};

export type AdminCallRequest = {
  id: number;
  patient_id: number;
  reason: string;
  note: string | null;
  status: string;
  created_at: string;
  requested_by_user_id: number;
  handler_user_id: number | null;
  resolved_at: string | null;
};

export async function getAdminCallTasks(): Promise<AdminCallTask[]> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/call-tasks`,
    {
      headers: buildHeaders(),
      cache: "no-store",
    }
  );
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Fehler beim Laden der Aufgaben")
    );
  }
  return response.json();
}

export type AdminPatientIntake = {
  id: number;
  requested_by_user_id: number | null;
  full_name: string;
  birthdate: string | null;
  address: string | null;
  phone: string | null;
  contact_person: string | null;
  care_level: string | null;
  note: string | null;
  status: string;
  handled_by_user_id: number | null;
  handled_at: string | null;
  patti_patient_id: number | null;
  created_at: string;
  updated_at: string;
};

export async function getAdminPatientIntakes(
  status?: string
): Promise<AdminPatientIntake[]> {
  const url = new URL(`${API_BASE_URL}/admin/patient-intakes`);
  if (status) url.searchParams.set("status", status);
  const response = await fetchWithRefresh(url.toString(), {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Fehler beim Laden der Neuaufnahmen")
    );
  }
  return response.json();
}

export async function resolveAdminPatientIntake(
  id: number,
  payload: { status: "done" | "rejected"; patti_patient_id?: number | null }
): Promise<AdminPatientIntake> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/patient-intakes/${id}/resolve`,
    {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Fehler beim Abschließen der Neuaufnahme")
    );
  }
  return response.json();
}

export type AdminTraining = {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
};

export async function getAdminTrainings(
  upcomingOnly = false
): Promise<AdminTraining[]> {
  const url = new URL(`${API_BASE_URL}/admin/trainings`);
  if (upcomingOnly) url.searchParams.set("upcoming_only", "true");
  const response = await fetchWithRefresh(url.toString(), {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Fehler beim Laden der Fortbildungen")
    );
  }
  return response.json();
}

export async function createAdminTraining(payload: {
  title: string;
  description?: string | null;
  location?: string | null;
  starts_at: string;
  ends_at?: string | null;
}): Promise<AdminTraining> {
  const response = await fetchWithRefresh(`${API_BASE_URL}/admin/trainings`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Fortbildung konnte nicht angelegt werden")
    );
  }
  return response.json();
}

export async function deleteAdminTraining(id: number): Promise<void> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/trainings/${id}`,
    { method: "DELETE", headers: buildHeaders() }
  );
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Fortbildung konnte nicht gelöscht werden")
    );
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/auth/password-reset/request`, {
    method: "POST",
    credentials: "include",
    headers: buildHeaders(),
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Reset-Anfrage fehlgeschlagen")
    );
  }
}

export async function confirmPasswordReset(
  token: string,
  newPassword: string
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/auth/password-reset/confirm`, {
    method: "POST",
    credentials: "include",
    headers: buildHeaders(),
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Reset fehlgeschlagen")
    );
  }
}

export async function markCaretakerChanged(
  patientId: number
): Promise<void> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/patients/${patientId}/caretaker-changed`,
    {
      method: "POST",
      headers: buildHeaders(),
    }
  );
  if (!response.ok) {
    throw new Error(
      await parseError(
        response,
        "Fehler beim Markieren des neuen Hauptbetreuers"
      )
    );
  }
}

export async function markOfficeCallDone(patientId: number): Promise<void> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/patients/${patientId}/office-call-done`,
    {
      method: "POST",
      headers: buildHeaders(),
    }
  );
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Fehler beim Markieren als erledigt")
    );
  }
}

export async function getAdminCallRequests(): Promise<AdminCallRequest[]> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/call-requests`,
    {
      headers: buildHeaders(),
      cache: "no-store",
    }
  );
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Fehler beim Laden der Rückruf-Anfragen")
    );
  }
  return response.json();
}

export type AdminContract = {
  id: number;
  patient_id: number;
  patient_name: string | null;
  signer_name: string;
  status: string;
  source: string;
  info_text_version: string | null;
  note: string | null;
  signed_at: string;
  has_asset: boolean;
};

export async function getAdminContracts(
  search?: string
): Promise<AdminContract[]> {
  const url = new URL(`${API_BASE_URL}/admin/contracts`);
  if (search && search.trim()) url.searchParams.set("q", search.trim());
  const response = await fetchWithRefresh(url.toString(), {
    headers: buildHeaders(),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Fehler beim Laden der Verträge")
    );
  }
  return response.json();
}

export async function getAdminContract(id: number): Promise<SignatureEvent> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/contracts/${id}`,
    {
      headers: buildHeaders(),
      cache: "no-store",
    }
  );
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Vertrag konnte nicht geladen werden")
    );
  }
  return response.json();
}

export async function markCallRequestDone(
  requestId: number
): Promise<AdminCallRequest> {
  const response = await fetchWithRefresh(
    `${API_BASE_URL}/admin/call-requests/${requestId}/done`,
    {
      method: "POST",
      headers: buildHeaders(),
    }
  );
  if (!response.ok) {
    throw new Error(
      await parseError(response, "Fehler beim Abschließen der Anfrage")
    );
  }
  return response.json();
}