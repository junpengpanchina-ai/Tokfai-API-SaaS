import type { Metadata } from "next";

import { PricingContent } from "@/components/pricing-content";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { TOKFAI_PRODUCT_TAGLINE } from "@/lib/tokfai-api";

export const metadata: Metadata = {
  title: "Pricing",
  description: TOKFAI_PRODUCT_TAGLINE,
};

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1">
        <PricingContent />
      </main>
      <PublicFooter />
    </div>
  );
}
