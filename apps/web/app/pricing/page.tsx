import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";

import { PricingContent } from "@/components/pricing-content";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { fetchBillingPlansForPricing } from "@/lib/billing/recharge-plans";
import { TOKFAI_PRODUCT_TAGLINE } from "@/lib/tokfai-api";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Pricing",
  description: TOKFAI_PRODUCT_TAGLINE,
};

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  noStore();

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { plans, purchaseDisabled } = await fetchBillingPlansForPricing();

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      <PublicHeader />
      <main className="flex-1">
        <PricingContent
          plans={plans}
          purchaseDisabled={purchaseDisabled}
          isLoggedIn={Boolean(session?.user)}
        />
      </main>
      <PublicFooter />
    </div>
  );
}
