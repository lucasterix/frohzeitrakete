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
};

export type CreateUserPayload = {
  email: string;
  password: string;
  full_name: string;
  role: string;
  is_active?: boolean;
  patti_person_id?: number | null;
};

export type UpdateUserPayload = {
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  patti_person_id?: number | null;
  password?: string | null;
};

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
};

export type WorkReport = {
  user: {
    id: number;
    email: string;
    full_name: string;
    role: string;
  };
  year: number;
  month: number;
  total_hours: number;
  total_km: number;
  working_days: number;
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