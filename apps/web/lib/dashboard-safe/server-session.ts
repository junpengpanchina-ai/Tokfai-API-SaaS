import type { Session, User } from "@supabase/supabase-js";

import { loadDashboardShellCredits } from "@/lib/load-dashboard-shell-credits";
import {
  hasSupabaseServerEnv,
  tryCreateServerClient,
} from "@/lib/supabase/server";

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

/** Re-export fail-open client for dashboard data loaders. */
export { tryCreateServerClient };

function resolveClientError(): DashboardSupabaseError {
  return hasSupabaseServerEnv() ? "client_unavailable" : "missing_env";
}

function logDashboardSsr(
  event: string,
  detail: Record<string, string | boolean | null | undefined> = {}
) {
  console.info("[dashboard-ssr]", event, detail);
}

export async function loadDashboardShellSession(): Promise<DashboardShellSession> {
  logDashboardSsr("start", { scope: "shell" });
  logDashboardSsr("supabase_env", {
    present: hasSupabaseServerEnv(),
  });

  const supabase = tryCreateServerClient();
  if (!supabase) {
    const error = resolveClientError();
    logDashboardSsr("session", { status: "error", error });
    logDashboardSsr("fallback_render", { scope: "shell", reason: error });
    return {
      user: null,
      email: "",
      credits: EMPTY_SHELL_CREDITS,
      error,
    };
  }

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      logDashboardSsr("session", {
        status: "error",
        error: "auth_unavailable",
      });
      logDashboardSsr("fallback_render", {
        scope: "shell",
        reason: "auth_unavailable",
      });
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

    logDashboardSsr("session", {
      status: user ? "loaded" : "null",
      hasUser: Boolean(user),
    });

    return {
      user: user ?? null,
      email: user?.email ?? "",
      credits,
      error: null,
    };
  } catch (error) {
    console.error("[dashboard-ssr-fail-open]", "loadDashboardShellSession", error);
    logDashboardSsr("session", { status: "error", error: "auth_unavailable" });
    logDashboardSsr("fallback_render", {
      scope: "shell",
      reason: "auth_unavailable",
    });
    return {
      user: null,
      email: "",
      credits: EMPTY_SHELL_CREDITS,
      error: "auth_unavailable",
    };
  }
}

export async function loadDashboardPageSession(): Promise<DashboardPageSession> {
  logDashboardSsr("start", { scope: "page" });
  logDashboardSsr("supabase_env", {
    present: hasSupabaseServerEnv(),
  });

  const supabase = tryCreateServerClient();
  if (!supabase) {
    const error = resolveClientError();
    logDashboardSsr("session", { status: "error", error });
    logDashboardSsr("fallback_render", { scope: "page", reason: error });
    return {
      user: null,
      session: null,
      error,
    };
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      logDashboardSsr("session", {
        status: "error",
        error: "auth_unavailable",
      });
      logDashboardSsr("fallback_render", {
        scope: "page",
        reason: "auth_unavailable",
      });
      return {
        user: null,
        session: null,
        error: "auth_unavailable",
      };
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    logDashboardSsr("session", {
      status: user ? "loaded" : "null",
      hasUser: Boolean(user),
      hasSession: Boolean(session),
    });

    return {
      user: user ?? null,
      session: session ?? null,
      error: null,
    };
  } catch (error) {
    console.error("[dashboard-ssr-fail-open]", "loadDashboardPageSession", error);
    logDashboardSsr("session", { status: "error", error: "auth_unavailable" });
    logDashboardSsr("fallback_render", {
      scope: "page",
      reason: "auth_unavailable",
    });
    return {
      user: null,
      session: null,
      error: "auth_unavailable",
    };
  }
}

/** Re-throw Next.js navigation errors so try/catch fail-open does not swallow redirects. */
export function rethrowIfNextNavigation(error: unknown): void {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string"
  ) {
    const digest = (error as { digest: string }).digest;
    if (
      digest.startsWith("NEXT_REDIRECT") ||
      digest.startsWith("NEXT_NOT_FOUND")
    ) {
      throw error;
    }
  }
}
