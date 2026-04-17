export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.froehlichdienste.de";

export function buildHeaders(): HeadersInit {
  return {
    Accept: "application/json",
  };
}

export async function fetchWithRefresh(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const merged: RequestInit = {
    ...init,
    credentials: "include",
  };
  let res = await fetch(url, merged);
  if (res.status === 401) {
    const refresh = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refresh.ok) {
      res = await fetch(url, merged);
    }
  }
  return res;
}
