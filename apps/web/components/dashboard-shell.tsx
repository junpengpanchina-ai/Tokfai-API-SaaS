import { DashboardShellClient } from "@/components/dashboard-shell-client";
import type { DashboardShellCredits } from "@/lib/dashboard-safe/shell-credits";
import { loadDashboardShellCredits } from "@/lib/load-dashboard-shell-credits";
import { createClient } from "@/lib/supabase/server";

export async function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email ?? "";
  let credits = { balance: null, loaded: false } as DashboardShellCredits;
  if (user) {
    try {
      credits = await loadDashboardShellCredits(user.id);
    } catch {
      credits = { balance: null, loaded: false };
    }
  }

  return (
    <DashboardShellClient email={email} credits={credits}>
      {children}
    </DashboardShellClient>
  );
}
