const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.froehlichdienste.de";

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

async function parseError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();
    return typeof data?.detail === "string" ? data.detail : JSON.stringify(data);
  } catch {
    return fallback;
  }
}

async function fetchWithRefresh(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let response = await fetch(input, {
    credentials: "include",
    ...init,
  });

  if (response.status !== 401) {
    return response;
  }

  const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: buildHeaders(),
  });

  if (!refreshResponse.ok) {
    return response;
  }

  response = await fetch(input, {
    credentials: "include",
    ...init,
  });

  return response;
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Login fehlgeschlagen"));
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

export async function getMe(): Promise<User> {
  const response = await fetchWithRefresh(`${API_BASE_URL}/auth/me`, {
    headers: buildHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Fehler beim Laden des Users"));
  }

  return response.json();
}

export async function getMySessions(): Promise<SessionInfo[]> {
  const response = await fetchWithRefresh(`${API_BASE_URL}/auth/sessions`, {
    headers: buildHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Fehler beim Laden der Sessions"));
  }

  return response.json();
}

export async function revokeMySession(sessionId: number): Promise<SessionInfo> {
  const response = await fetchWithRefresh(`${API_BASE_URL}/auth/sessions/${sessionId}/revoke`, {
    method: "POST",
    headers: buildHeaders(),
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Fehler beim Widerrufen der Session"));
  }

  return response.json();
}

export async function getUsers(): Promise<User[]> {
  const response = await fetchWithRefresh(`${API_BASE_URL}/admin/users`, {
    headers: buildHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Fehler beim Laden der User"));
  }

  return response.json();
}

export async function createUser(payload: CreateUserPayload): Promise<User> {
  const response = await fetchWithRefresh(`${API_BASE_URL}/admin/users`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Fehler beim Erstellen des Users"));
  }

  return response.json();
}

export async function updateUser(
  userId: number,
  payload: UpdateUserPayload
): Promise<User> {
  const response = await fetchWithRefresh(`${API_BASE_URL}/admin/users/${userId}`, {
    method: "PATCH",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Fehler beim Aktualisieren des Users"));
  }

  return response.json();
}

export async function activateUser(userId: number): Promise<User> {
  const response = await fetchWithRefresh(`${API_BASE_URL}/admin/users/${userId}/activate`, {
    method: "POST",
    headers: buildHeaders(),
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Fehler beim Aktivieren des Users"));
  }

  return response.json();
}

export async function deactivateUser(userId: number): Promise<User> {
  const response = await fetchWithRefresh(`${API_BASE_URL}/admin/users/${userId}/deactivate`, {
    method: "POST",
    headers: buildHeaders(),
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Fehler beim Deaktivieren des Users"));
  }

  return response.json();
}

export async function deleteUser(userId: number): Promise<void> {
  const response = await fetchWithRefresh(`${API_BASE_URL}/admin/users/${userId}`, {
    method: "DELETE",
    headers: buildHeaders(),
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Fehler beim Löschen des Users"));
  }
}

export async function getUserSessions(userId: number): Promise<SessionInfo[]> {
  const response = await fetchWithRefresh(`${API_BASE_URL}/admin/users/${userId}/sessions`, {
    headers: buildHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Fehler beim Laden der User-Sessions"));
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
    throw new Error(await parseError(response, "Fehler beim Widerrufen der Session"));
  }

  return response.json();
}

export async function getMyPatients(): Promise<Patient[]> {
  const response = await fetchWithRefresh(`${API_BASE_URL}/mobile/patients`, {
    headers: buildHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Fehler beim Laden der Patienten"));
  }

  return response.json();
}