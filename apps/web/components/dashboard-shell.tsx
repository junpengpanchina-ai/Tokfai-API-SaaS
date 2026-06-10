import { DashboardFooter } from "@/components/dashboard-footer";
import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardMobileNav, DashboardSidebar } from "@/components/dashboard-nav";
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

  return (
    <div className="min-h-svh md:flex">
      <DashboardSidebar />
      <div className="flex min-h-svh min-w-0 flex-1 flex-col">
        <DashboardMobileNav />
        <DashboardHeader email={email} />
        <main className="min-w-0 flex-1 p-4 sm:p-6 md:p-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
        <DashboardFooter />
      </div>
    </div>
  );
}
