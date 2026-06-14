import { CustomerIntegrationGuide } from "@/components/customer-integration-guide";

export const metadata = {
  title: "Integration guide",
};

export default function DashboardDocsPage() {
  return (
    <div className="w-full max-w-none">
      <CustomerIntegrationGuide showDashboardLinks />
    </div>
  );
}
