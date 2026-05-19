import { DocsContent } from "@/components/docs-content";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";

export default function DocsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />

      <main className="container flex-1 py-16">
        <div className="mx-auto max-w-4xl">
          <DocsContent showDashboardLinks={false} />
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
