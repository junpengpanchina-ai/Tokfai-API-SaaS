import { AuthSuccessToast } from "@/components/auth-success-toast";
import { DashboardFooter } from "@/components/dashboard-footer";
import {
  DashboardMobileShell,
  DashboardSidebar,
} from "@/components/dashboard-nav";
import type { DashboardShellCredits } from "@/lib/dashboard-shell-credits";
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
    <div className="min-h-svh overflow-x-hidden bg-background">
      <AuthSuccessToast />
      <aside
        className="fixed left-0 top-0 z-30 hidden h-svh w-60 border-r bg-muted/30 md:flex md:flex-col"
      >
        <DashboardSidebar email={email} credits={credits} />
      </aside>
      <div className="flex min-w-0 flex-col md:pl-60">
        <DashboardMobileShell email={email} credits={credits} />
        <main className="min-h-svh min-w-0 flex-1 px-4 py-6 sm:px-6 md:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
        <DashboardFooter />
      </div>
    </div>
  );
}
