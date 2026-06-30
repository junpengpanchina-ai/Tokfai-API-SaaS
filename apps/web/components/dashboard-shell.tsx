import { DashboardDataUnavailableBanner } from "@/components/dashboard-data-unavailable-banner";
import { DashboardShellClient } from "@/components/dashboard-shell-client";
import { loadDashboardShellSession } from "@/lib/dashboard-safe/server-session";

export async function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { email, credits, error } = await loadDashboardShellSession();

  return (
    <DashboardShellClient
      email={email}
      credits={credits}
      sessionUnavailable={error !== null}
    >
      {error ? <DashboardDataUnavailableBanner /> : null}
      {children}
    </DashboardShellClient>
  );
}
