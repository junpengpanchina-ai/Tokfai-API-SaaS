"use client";

import { AuthSuccessToast } from "@/components/auth-success-toast";
import { DashboardFooter } from "@/components/dashboard-footer";
import { DashboardShellStaticFallback } from "@/components/dashboard-shell-static-fallback";
import {
  DashboardMobileShell,
  DashboardSidebar,
} from "@/components/dashboard-shell-nav";
import { DashboardMountedOnly } from "@/lib/dashboard-safe/mounted-only";
import { normalizeShellCredits } from "@/lib/dashboard-safe/normalize-dashboard-data";
import { DashboardSectionErrorBoundary } from "@/lib/dashboard-safe/section-error-boundary";
import type { DashboardShellCredits } from "@/lib/dashboard-safe/shell-credits";

export function DashboardShellClient({
  email,
  credits,
  sessionUnavailable = false,
  children,
}: {
  email: string;
  credits: DashboardShellCredits;
  sessionUnavailable?: boolean;
  children: React.ReactNode;
}) {
  const safeEmail = typeof email === "string" ? email : "";
  const safeCredits = normalizeShellCredits(credits);

  return (
    <div className="min-h-svh overflow-x-hidden bg-background">
      <DashboardMountedOnly
        fallback={<DashboardShellStaticFallback>{children}</DashboardShellStaticFallback>}
      >
        <AuthSuccessToast />
        <aside className="fixed left-0 top-0 z-30 hidden h-svh w-60 border-r bg-muted/30 md:flex md:flex-col">
          <DashboardSectionErrorBoundary context="dashboard-sidebar">
            <DashboardSidebar
              email={safeEmail}
              credits={safeCredits}
              sessionUnavailable={sessionUnavailable}
            />
          </DashboardSectionErrorBoundary>
        </aside>
        <div className="flex min-w-0 flex-col md:pl-60">
          <DashboardSectionErrorBoundary context="dashboard-mobile-shell">
            <DashboardMobileShell
              email={safeEmail}
              credits={safeCredits}
              sessionUnavailable={sessionUnavailable}
            />
          </DashboardSectionErrorBoundary>
          <main className="min-h-svh min-w-0 flex-1 px-4 py-6 sm:px-6 md:py-8">
            <div className="mx-auto w-full max-w-6xl">
              <DashboardSectionErrorBoundary context="dashboard-main">
                {children}
              </DashboardSectionErrorBoundary>
            </div>
          </main>
          <DashboardFooter />
        </div>
      </DashboardMountedOnly>
    </div>
  );
}
