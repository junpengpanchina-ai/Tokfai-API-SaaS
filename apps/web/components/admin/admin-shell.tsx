import { DashboardShell } from "@/components/dashboard-shell";

import { AdminNav } from "./admin-nav";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell>
      <div className="flex flex-col gap-6">
        <AdminNav />
        {children}
      </div>
    </DashboardShell>
  );
}
