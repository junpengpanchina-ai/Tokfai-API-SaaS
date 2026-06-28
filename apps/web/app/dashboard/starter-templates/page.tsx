import { DashboardSafeFallback } from "@/lib/dashboard-safe/fallback-page";

export const metadata = {
  title: "Starter templates",
};

export default function StarterTemplatesPage() {
  return <DashboardSafeFallback page="starter-templates" />;
}
