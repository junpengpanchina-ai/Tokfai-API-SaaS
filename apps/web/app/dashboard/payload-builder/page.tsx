import { DashboardSafeFallback } from "@/lib/dashboard-safe/fallback-page";

export const metadata = {
  title: "Payload builder",
};

export default function PayloadBuilderPage() {
  return <DashboardSafeFallback page="payload-builder" />;
}
