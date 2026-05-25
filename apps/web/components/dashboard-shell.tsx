import { ApiReferenceLink } from "@/components/api-reference-link";
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
    <div className="flex min-h-screen flex-col md:flex-row">
      <DashboardSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardMobileNav />
        <DashboardHeader email={email} />
        <main className="flex-1 p-4 sm:p-6 md:p-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
        <footer className="border-t px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>Tokfai · OpenAI-compatible image &amp; chat API</span>
            <ApiReferenceLink />
          </div>
        </footer>
      </div>
    </div>
  );
}
