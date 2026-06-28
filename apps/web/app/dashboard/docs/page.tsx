import { DashboardSafeFallback } from "@/lib/dashboard-safe/fallback-page";

export const metadata = {
  title: "API integration handbook",
  description:
    "Tokfai API gateway integration guide — API Key, chat, batch, Usage and Credits.",
};

export default function DashboardDocsPage() {
  return (
    <div className="w-full max-w-none">
      <DashboardSafeFallback page="docs" />
    </div>
  );
}
