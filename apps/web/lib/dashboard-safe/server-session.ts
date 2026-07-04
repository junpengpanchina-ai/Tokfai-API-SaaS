import type { Session, User } from "@supabase/supabase-js";

import { loadDashboardShellCredits } from "@/lib/load-dashboard-shell-credits";
import { createClient } from "@/lib/supabase/server";

import { EMPTY_DASHBOARD_OVERVIEW } from "./dtos/overview";
import type { CreditsPageData } from "./dtos/credits";
import type { UsagePageState } from "./dtos/usage";
import {
  EMPTY_SHELL_CREDITS,
  type DashboardShellCredits,
} from "./shell-credits";

export type DashboardSupabaseError =
  | "missing_env"
  | "client_unavailable"
  | "auth_unavailable";

export type DashboardShellSession = {
  user: User | null;
  email: string;
  credits: DashboardShellCredits;
  error: DashboardSupabaseError | null;
};

export type DashboardPageSession = {
  user: User | null;
  session: Session | null;
  error: DashboardSupabaseError | null;
};

export { EMPTY_DASHBOARD_OVERVIEW };

export const EMPTY_USAGE_PAGE_STATE: UsagePageState = { status: "error" };

export const EMPTY_CREDITS_PAGE_DATA: CreditsPageData = {
  balance: {
    balance: 0,
    balanceFromProfile: false,
    lastChangeAt: null,
    todayConsumed: 0,
    last7DaysConsumed: 0,
    showNoLedgerHint: false,
  },
  ledger: [],
  orders: [],
  error: "temporary",
};

function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** Returns null instead of throwing when env or client creation fails. */
export function tryCreateServerClient() {
  if (!hasSupabaseEnv()) {
    return null;
  }

  try {
    return createClient();
  } catch (error) {
    console.error("[dashboard-ssr-fail-open]", "tryCreateServerClient", error);
    return null;
  }
}

function resolveClientError(): DashboardSupabaseError {
  return hasSupabaseEnv() ? "client_unavailable" : "missing_env";
}

export async function loadDashboardShellSession(): Promise<DashboardShellSession> {
  const supabase = tryCreateServerClient();
  if (!supabase) {
    return {
      user: null,
      email: "",
      credits: EMPTY_SHELL_CREDITS,
      error: resolveClientError(),
    };
  }

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      return {
        user: null,
        email: "",
        credits: EMPTY_SHELL_CREDITS,
        error: "auth_unavailable",
      };
    }

    const credits = user
      ? await loadDashboardShellCredits(user.id)
      : EMPTY_SHELL_CREDITS;

    return {
      user: user ?? null,
      email: user?.email ?? "",
      credits,
      error: null,
    };
  } catch (error) {
    console.error("[dashboard-ssr-fail-open]", "loadDashboardShellSession", error);
    return {
      user: null,
      email: "",
      credits: EMPTY_SHELL_CREDITS,
      error: "auth_unavailable",
    };
  }
}

export async function loadDashboardPageSession(): Promise<DashboardPageSession> {
  const supabase = tryCreateServerClient();
  if (!supabase) {
    return {
      user: null,
      session: null,
      error: resolveClientError(),
    };
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      return {
        user: null,
        session: null,
        error: "auth_unavailable",
      };
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    return {
      user: user ?? null,
      session: session ?? null,
      error: null,
    };
  } catch (error) {
    console.error("[dashboard-ssr-fail-open]", "loadDashboardPageSession", error);
    return {
      user: null,
      session: null,
      error: "auth_unavailable",
    };
  }
}
