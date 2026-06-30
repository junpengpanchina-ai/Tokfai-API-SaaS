import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { loginPathWithNext } from "@/lib/auth/login-redirect";
import { CreditsContentClient } from "@/components/credits-content-client";
import { loadCreditsPageData } from "@/lib/credits";
import {
  EMPTY_CREDITS_PAGE_DATA,
  loadDashboardPageSession,
} from "@/lib/dashboard-safe/server-session";

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

  const { user, error } = await loadDashboardPageSession();
  const checkoutSucceeded =
    searchParams.success === "true" || Boolean(searchParams.session_id);

  if (error) {
    return (
      <>
        <CreditsReturnRefresh
          shouldRefresh={checkoutSucceeded}
          sessionId={searchParams.session_id}
        />
        <CreditsContentClient
          creditsState={EMPTY_CREDITS_PAGE_DATA}
          checkoutSucceeded={checkoutSucceeded}
          checkoutStatus={searchParams.status}
          checkoutSessionId={searchParams.session_id}
        />
      </>
    );
  }

  if (!user) {
    redirect(loginPathWithNext("/dashboard/credits"));
  }

  const creditsState = await loadCreditsPageData(user.id);

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
