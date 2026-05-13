import Link from "next/link";

import { Button } from "@/components/ui/button";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
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
    <div className="flex min-h-screen">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="text-sm text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium text-foreground">{email}</span>
          </div>
          <form action="/auth/sign-out" method="post">
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </header>
        <main className="flex-1 p-6 md:p-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
        <footer className="border-t px-6 py-4 text-xs text-muted-foreground">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
            <span>Tokfai · OpenAI-compatible image &amp; chat API</span>
            <Link
              href="/docs"
              className="transition-colors hover:text-foreground"
            >
              API reference →
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
