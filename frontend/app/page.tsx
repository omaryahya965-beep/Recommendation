"use client";

import { useI18n } from "@/lib/i18n";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { loadAuth, ROLE_HOME } from "@/lib/api";

export default function Home() {
  useI18n();
  const router = useRouter();
  useEffect(() => {
    const auth = loadAuth();
    router.replace(auth ? (ROLE_HOME[auth.user.role] ?? "/login") : "/login");
  }, [router]);
  return null;
}
