import { AuthSuccessToast } from "@/components/auth-success-toast";
import { DashboardFooter } from "@/components/dashboard-footer";
import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardMobileNav, DashboardSidebar } from "@/components/dashboard-nav";
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
  const credits = user
    ? await loadDashboardShellCredits(user.id)
    : { balance: null, loaded: false };

  return (
    <div className="min-h-svh overflow-x-hidden md:flex">
      <AuthSuccessToast />
      <DashboardSidebar credits={credits} />
      <div className="flex min-h-svh min-w-0 flex-1 flex-col overflow-x-hidden">
        <DashboardHeader email={email} credits={credits} />
        <DashboardMobileNav credits={credits} />
        <main className="min-w-0 flex-1 p-4 sm:p-6 md:p-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
        <DashboardFooter />
      </div>
    </div>
  );
}
