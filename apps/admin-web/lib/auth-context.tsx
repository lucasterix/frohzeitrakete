"use client";

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
} from "react";
import useSWR from "swr";
import { User, getMe } from "@/lib/api";

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  mutate: () => void;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  mutate: () => {},
});

const fetcher = () => getMe();

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, mutate } = useSWR("auth/me", fetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    dedupingInterval: 60_000,
    errorRetryCount: 1,
  });

  const refresh = useCallback(() => {
    mutate();
  }, [mutate]);

  return (
    <AuthContext.Provider
      value={{ user: data ?? null, isLoading, mutate: refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
