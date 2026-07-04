import { DashboardDataUnavailableBanner } from "@/components/dashboard-data-unavailable-banner";
import { DashboardShellClient } from "@/components/dashboard-shell-client";
import {
  loadDashboardShellSession,
} from "@/lib/dashboard-safe/server-session";
import { EMPTY_SHELL_CREDITS } from "@/lib/dashboard-safe/shell-credits";

export async function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  let email = "";
  let credits = EMPTY_SHELL_CREDITS;
  let error: "missing_env" | "client_unavailable" | "auth_unavailable" | null =
    null;

  try {
    const session = await loadDashboardShellSession();
    email = session.email;
    credits = session.credits;
    error = session.error;
  } catch (err) {
    console.error("[dashboard-ssr-fail-open]", "DashboardShell", err);
    error = "auth_unavailable";
  }

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
