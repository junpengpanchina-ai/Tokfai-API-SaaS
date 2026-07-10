import { DashboardShell } from "@/components/dashboard-shell";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  console.info("[dashboard-ssr]", "start", { scope: "dashboard/layout" });
  return <DashboardShell>{children}</DashboardShell>;
}
