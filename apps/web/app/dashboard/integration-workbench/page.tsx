import { IntegrationWorkbenchPageClient } from "./integration-workbench-client";

export const metadata = {
  title: "Integration Workbench",
  description:
    "Create a key, verify a request, plan capacity, copy templates, and hand off production integration.",
};

export default function IntegrationWorkbenchPage() {
  return <IntegrationWorkbenchPageClient />;
}
