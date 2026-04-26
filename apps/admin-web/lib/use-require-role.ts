"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export function useRequireRole(allowedRoles: string[]) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user || !allowedRoles.includes(user.role)) {
      router.replace(user ? "/user" : "/");
    }
  }, [user, isLoading, allowedRoles, router]);

  const authorized = !isLoading && user != null && allowedRoles.includes(user.role);

  return { user, isLoading, authorized };
}

const OFFICE_ROLES = ["admin", "buero", "standortleiter", "pflegehilfsmittel", "buchhaltung"];
const ADMIN_ROLES = ["admin"];

export function useRequireOffice() {
  return useRequireRole(OFFICE_ROLES);
}

export function useRequireAdmin() {
  return useRequireRole(ADMIN_ROLES);
}
