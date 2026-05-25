import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import {
  CreditsContentClient,
  type CreditsLoadState,
} from "@/components/credits-content-client";
import {
  DmitServerError,
  getDmitBaseUrl,
  getMyCredits,
  listMyCreditLedger,
} from "@/lib/dmit/server";
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

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const creditsState = session?.access_token
    ? await loadCreditsState(session.access_token)
    : missingSessionCreditsState();
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
      />
    </>
  );
}

async function loadCreditsState(accessToken: string): Promise<CreditsLoadState> {
  const [profileResult, ledgerResult] = await Promise.all([
    readCredits(accessToken),
    readLedger(accessToken),
  ]);
  const debug = [profileResult.debug, ledgerResult.debug];
  const failed = [profileResult, ledgerResult].find((result) => !result.ok);
  if (failed) {
    return {
      profile: profileResult.ok ? profileResult.data : null,
      ledger: ledgerResult.ok ? ledgerResult.data : [],
      error:
        failed.debug.status === 401 || failed.debug.status === 403
          ? "auth"
          : "temporary",
      debug,
    };
  }

  if (!profileResult.ok || !ledgerResult.ok) {
    return {
      profile: null,
      ledger: [],
      error: "temporary",
      debug,
    };
  }

  return {
    profile: profileResult.data,
    ledger: ledgerResult.data,
    error: null,
    debug,
  };
}

function missingSessionCreditsState(): CreditsLoadState {
  return {
    profile: null,
    ledger: [],
    error: "auth",
    debug: [
      {
        endpoint: "Supabase session",
        url: "dashboard server session",
        status: 401,
        code: "missing_session",
        message: "Missing Supabase session.access_token.",
      },
    ],
  };
}

async function readCredits(accessToken: string) {
  const endpoint = "/v1/me/credits";
  try {
    return {
      ok: true as const,
      data: await getMyCredits(accessToken),
      debug: okDebug(endpoint),
    };
  } catch (err) {
    return {
      ok: false as const,
      debug: errorDebug(endpoint, err),
    };
  }
}

async function readLedger(accessToken: string) {
  const endpoint = "/v1/me/credits/ledger?limit=50";
  try {
    return {
      ok: true as const,
      data: await listMyCreditLedger(accessToken, 50),
      debug: okDebug(endpoint),
    };
  } catch (err) {
    return {
      ok: false as const,
      debug: errorDebug(endpoint, err),
    };
  }
}

function okDebug(endpoint: string) {
  return {
    endpoint,
    url: `${getDmitBaseUrl()}${endpoint}`,
    status: 200,
    code: null,
    message: null,
  };
}

function errorDebug(endpoint: string, err: unknown) {
  if (err instanceof DmitServerError) {
    return {
      endpoint,
      url: `${getDmitBaseUrl()}${endpoint}`,
      status: err.status,
      code: err.code ?? null,
      message: err.message,
    };
  }
  return {
    endpoint,
    url: `${getDmitBaseUrl()}${endpoint}`,
    status: null,
    code: "request_failed",
    message: err instanceof Error ? err.message : "Unknown request error.",
  };
}
