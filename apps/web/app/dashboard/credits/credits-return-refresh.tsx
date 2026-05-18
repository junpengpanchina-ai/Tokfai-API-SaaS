"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function CreditsReturnRefresh({
  shouldRefresh,
  sessionId,
}: {
  shouldRefresh: boolean;
  sessionId?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!shouldRefresh) return;

    const refreshKey = `tokfai:credits-return-refresh:${sessionId ?? "success"}`;
    if (window.sessionStorage.getItem(refreshKey) === "done") return;

    window.sessionStorage.setItem(refreshKey, "done");
    router.refresh();
  }, [router, sessionId, shouldRefresh]);

  return null;
}
