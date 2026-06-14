import { CustomerIntegrationGuide } from "@/components/customer-integration-guide";

export const metadata = {
  title: "API integration handbook",
  description:
    "Tokfai API gateway integration guide — API Key, chat, batch, Usage and Credits.",
};

export default function DashboardDocsPage() {
  return (
    <div className="w-full max-w-none">
      <CustomerIntegrationGuide showDashboardLinks />
    </div>
  );
}
