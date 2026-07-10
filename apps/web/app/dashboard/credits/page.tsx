import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { loginPathWithNext } from "@/lib/auth/login-redirect";
import { CreditsContentClient } from "@/components/credits-content-client";
import { loadCreditsPageData } from "@/lib/credits";
import {
  EMPTY_CREDITS_PAGE_DATA,
  loadDashboardPageSession,
  rethrowIfNextNavigation,
} from "@/lib/dashboard-safe/server-session";

import { CreditsReturnRefresh } from "./credits-return-refresh";

export const metadata = {
  title: "Credits",
};
export const dynamic = "force-dynamic";

type CreditsSearchParams = {
  status?: string;
  success?: string;
  session_id?: string;
};

export default async function CreditsPage({
  searchParams,
}: {
  searchParams?: CreditsSearchParams;
}) {
  noStore();

  const params = searchParams ?? {};
  const checkoutSucceeded =
    params.success === "true" || Boolean(params.session_id);

  try {
    const { user, error } = await loadDashboardPageSession();

    if (error) {
      return (
        <>
          <CreditsReturnRefresh
            shouldRefresh={checkoutSucceeded}
            sessionId={params.session_id}
          />
          <CreditsContentClient
            creditsState={EMPTY_CREDITS_PAGE_DATA}
            checkoutSucceeded={checkoutSucceeded}
            checkoutStatus={params.status}
            checkoutSessionId={params.session_id}
          />
        </>
      );
    }

    if (!user) {
      redirect(loginPathWithNext("/dashboard/credits"));
    }

    let creditsState = EMPTY_CREDITS_PAGE_DATA;
    try {
      creditsState = await loadCreditsPageData(user.id);
    } catch (err) {
      console.error("[dashboard-ssr-fail-open]", "credits/loadCreditsPageData", err);
    }

    return (
      <>
        <CreditsReturnRefresh
          shouldRefresh={checkoutSucceeded}
          sessionId={params.session_id}
        />
        <CreditsContentClient
          creditsState={creditsState}
          checkoutSucceeded={checkoutSucceeded}
          checkoutStatus={params.status}
          checkoutSessionId={params.session_id}
        />
      </>
    );
  } catch (err) {
    rethrowIfNextNavigation(err);
    console.error("[dashboard-ssr-fail-open]", "credits/page", err);
    return (
      <>
        <CreditsReturnRefresh
          shouldRefresh={checkoutSucceeded}
          sessionId={params.session_id}
        />
        <CreditsContentClient
          creditsState={EMPTY_CREDITS_PAGE_DATA}
          checkoutSucceeded={checkoutSucceeded}
          checkoutStatus={params.status}
          checkoutSessionId={params.session_id}
        />
      </>
    );
  }
}
