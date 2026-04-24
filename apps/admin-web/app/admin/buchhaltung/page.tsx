"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BuchhaltungIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/buchhaltung/bank-transaktionen");
  }, [router]);

  return null;
}
