import { AuthSuccessToast } from "@/components/auth-success-toast";
import {
  AdminDashboardMobileShell,
  AdminDashboardSidebar,
} from "@/components/admin-dashboard-shell-nav";
import { DashboardFooter } from "@/components/dashboard-footer";
import type { DashboardShellCredits } from "@/lib/dashboard-shell-credits";
import { loadDashboardShellCredits } from "@/lib/load-dashboard-shell-credits";
import { createClient } from "@/lib/supabase/server";

export async function AdminDashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  let email = "";
  let credits = { balance: null, loaded: false } as DashboardShellCredits;

  if (supabase) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      email = user?.email ?? "";
      if (user) {
        try {
          credits = await loadDashboardShellCredits(user.id);
        } catch {
          credits = { balance: null, loaded: false };
        }
      }
    } catch {
      email = "";
      credits = { balance: null, loaded: false };
    }
  }

  return (
    <div className="min-h-svh overflow-x-hidden bg-background">
      <AuthSuccessToast />
      <aside
        className="fixed left-0 top-0 z-30 hidden h-svh w-60 border-r bg-muted/30 md:flex md:flex-col"
      >
        <AdminDashboardSidebar email={email} credits={credits} />
      </aside>
      <div className="flex min-w-0 flex-col md:pl-60">
        <AdminDashboardMobileShell email={email} credits={credits} />
        <main className="min-h-svh min-w-0 flex-1 px-4 py-6 sm:px-6 md:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
        <DashboardFooter />
      </div>
    </div>
  );
}
