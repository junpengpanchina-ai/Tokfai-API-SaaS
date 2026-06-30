"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Renders `fallback` on server and the first client paint, then `children` after mount.
 * Keeps SSR and hydration HTML identical when `fallback` matches the pre-mount tree.
 */
export function DashboardMountedOnly({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
