import { AdminDashboardShell } from "@/components/admin-dashboard-shell";

import { AdminNav } from "./admin-nav";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminDashboardShell>
      <div className="flex flex-col gap-6">
        <AdminNav />
        {children}
      </div>
    </AdminDashboardShell>
  );
}
