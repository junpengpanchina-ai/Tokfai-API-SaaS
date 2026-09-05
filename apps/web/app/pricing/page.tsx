import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";

import { PricingContent } from "@/components/pricing-content";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { fetchBillingPlansForPricing } from "@/lib/billing/recharge-plans";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Pricing — start with ¥99",
  description:
    "Start with ¥99 to verify Base URL, API key, model calls, and the credit ledger. Then move to ¥499 / ¥999 or a project plan. Early public beta for developers and small teams.",
};

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  noStore();

  let isLoggedIn = false;
  try {
    const supabase = createClient();
    if (supabase) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      isLoggedIn = Boolean(session?.user);
    }
  } catch {
    isLoggedIn = false;
  }

  const { plans, purchaseDisabled } = await fetchBillingPlansForPricing();

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      <PublicHeader />
      <main className="flex-1">
        <PricingContent
          plans={plans}
          purchaseDisabled={purchaseDisabled}
          isLoggedIn={isLoggedIn}
        />
      </main>
      <PublicFooter />
    </div>
  );
}
