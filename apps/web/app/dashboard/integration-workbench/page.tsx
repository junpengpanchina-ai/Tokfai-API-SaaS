import { DashboardFirstRunAcceptancePanel } from "@/components/dashboard-first-run-acceptance";

export const metadata = {
  title: "First-run integration",
  description:
    "Base URL, API Key, recommended models, curl, Cursor, billing, and request_id — first-run acceptance.",
};

/**
 * P979 — replace heavy Integration Workbench safe-mode with a minimal first-run surface.
 * Core Chat/Billing untouched; links into API Keys / Docs / Usage.
 */
export default function IntegrationWorkbenchPage() {
  return (
    <div className="w-full max-w-3xl">
      <DashboardFirstRunAcceptancePanel />
    </div>
  );
}
