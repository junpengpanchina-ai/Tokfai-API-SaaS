import { ConsumerDocsGuide } from "@/components/consumer-docs-guide";

export const metadata = {
  title: "Integration docs",
  description:
    "Tokfai API gateway — quick start, Cherry Studio, OpenAI-compatible API, and Image API.",
};

export default function DashboardDocsPage() {
  return (
    <div className="w-full max-w-5xl">
      <ConsumerDocsGuide showDashboardLinks />
    </div>
  );
}
