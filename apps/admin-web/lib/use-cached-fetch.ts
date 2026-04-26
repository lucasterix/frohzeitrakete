"use client";

import useSWR, { mutate as globalMutate } from "swr";

type FetcherFn<T> = () => Promise<T>;

export function useCachedFetch<T>(key: string | null, fetcher: FetcherFn<T>) {
  const { data, error, isLoading, mutate } = useSWR<T>(
    key,
    () => fetcher(),
    {
      revalidateOnFocus: false,
      dedupingInterval: 15_000,
      errorRetryCount: 1,
    }
  );

  return { data, error, isLoading, mutate };
}

export function invalidateCache(keyPrefix: string) {
  globalMutate(
    (key) => typeof key === "string" && key.startsWith(keyPrefix),
    undefined,
    { revalidate: true }
  );
}
