import { DocsPageClient } from "./docs-client";

export const metadata = {
  title: "API integration handbook",
  description:
    "Tokfai API gateway integration guide — API Key, chat, batch, Usage and Credits.",
};

export default function DashboardDocsPage() {
  return (
    <div className="w-full max-w-none">
      <DocsPageClient />
    </div>
  );
}
