import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { CreditsContentClient } from "@/components/credits-content-client";
import { loadCreditsPageData } from "@/lib/credits";
import { createClient } from "@/lib/supabase/server";

import { CreditsReturnRefresh } from "./credits-return-refresh";

export const metadata = {
  title: "Credits",
};
export const dynamic = "force-dynamic";

export default async function CreditsPage({
  searchParams,
}: {
  searchParams: { status?: string; success?: string; session_id?: string };
}) {
  noStore();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard/credits");
  }

  const creditsState = await loadCreditsPageData(user.id);
  const checkoutSucceeded =
    searchParams.success === "true" || Boolean(searchParams.session_id);

  return (
    <>
      <CreditsReturnRefresh
        shouldRefresh={checkoutSucceeded}
        sessionId={searchParams.session_id}
      />
      <CreditsContentClient
        creditsState={creditsState}
        checkoutSucceeded={checkoutSucceeded}
        checkoutStatus={searchParams.status}
        checkoutSessionId={searchParams.session_id}
      />
    </>
  );
}
