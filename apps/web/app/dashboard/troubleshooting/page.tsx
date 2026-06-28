import { DashboardSafeFallback } from "@/lib/dashboard-safe/fallback-page";

export const metadata = {
  title: "Troubleshooting",
};

export default function TroubleshootingPage() {
  return <DashboardSafeFallback page="troubleshooting" />;
}
