import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DmitServerError,
  getDmitBaseUrl,
  type MeCreditLedgerEntry,
  type MeCredits,
  getMyCredits,
  listMyCreditLedger,
} from "@/lib/dmit/server";
import { formatCredits, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { CreditsReturnRefresh } from "./credits-return-refresh";
import { CreditsTopUpClient } from "./credits-top-up-client";

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

  if (!session?.access_token) {
    const creditsState = missingSessionCreditsState();
    return (
      <CreditsContent
        creditsState={creditsState}
        checkoutSucceeded={false}
        checkoutStatus={searchParams.status}
        sessionId={searchParams.session_id}
      />
    );
  }

  const creditsState = await loadCreditsState(session.access_token);
  const checkoutSucceeded =
    searchParams.success === "true" || Boolean(searchParams.session_id);

  return (
    <CreditsContent
      creditsState={creditsState}
      checkoutSucceeded={checkoutSucceeded}
      checkoutStatus={searchParams.status}
      sessionId={searchParams.session_id}
    />
  );
}

function CreditsContent({
  creditsState,
  checkoutSucceeded,
  checkoutStatus,
  sessionId,
}: {
  creditsState: CreditsLoadState;
  checkoutSucceeded: boolean;
  checkoutStatus?: string;
  sessionId?: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <CreditsReturnRefresh
        shouldRefresh={checkoutSucceeded}
        sessionId={sessionId}
      />

      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Credits</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Prepaid balance used by every API call. Data is loaded through DMIT
          with your Supabase session.
        </p>
      </div>

      <CheckoutStatusBanner
        status={checkoutStatus}
        checkoutSucceeded={checkoutSucceeded}
      />

      {creditsState.error ? (
        <CreditsLoadErrorCard state={creditsState} />
      ) : null}

      <Card>
        <CardHeader>
          <CardDescription>Current balance</CardDescription>
          <CardTitle className="text-4xl">
            {creditsState.profile
              ? formatCredits(creditsState.profile.credits_balance)
              : "Unavailable"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-muted-foreground">
          <div>
            Total purchased:{" "}
            <span className="font-medium text-foreground">
              {creditsState.profile
                ? formatCredits(creditsState.profile.total_credits_purchased)
                : "Unavailable"}
            </span>
          </div>
          <div>
            Total used:{" "}
            <span className="font-medium text-foreground">
              {creditsState.profile
                ? formatCredits(creditsState.profile.total_credits_used)
                : "Unavailable"}
            </span>
          </div>
          <div>
            Last updated:{" "}
            <span className="font-medium text-foreground">
              {creditsState.profile
                ? formatDateTime(creditsState.profile.updated_at)
                : "Unavailable"}
            </span>
          </div>
        </CardContent>
      </Card>

      <CreditsTopUpClient />

      <Card>
        <CardHeader>
          <CardTitle>Recent ledger entries</CardTitle>
          <CardDescription>
            Last 50 top-ups, debits, and adjustments. Written exclusively by
            DMIT.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {creditsState.ledger.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Amount
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Balance after
                    </th>
                    <th className="py-2 pr-4 font-medium">Reason</th>
                    <th className="py-2 pr-4 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {creditsState.ledger.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <TypeBadge type={entry.type} />
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">
                        <AmountCell amount={entry.amount} />
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">
                        {entry.balance_after != null
                          ? formatCredits(entry.balance_after)
                          : "—"}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {displayReason(entry.reason)}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {formatDateTime(entry.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type CreditsLoadErrorKind = "auth" | "temporary";

interface CreditsRequestDebug {
  endpoint: string;
  url: string;
  status: number | null;
  code: string | null;
  message: string | null;
}

interface CreditsLoadState {
  profile: MeCredits | null;
  ledger: MeCreditLedgerEntry[];
  error: CreditsLoadErrorKind | null;
  debug: CreditsRequestDebug[];
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

function okDebug(endpoint: string): CreditsRequestDebug {
  return {
    endpoint,
    url: `${getDmitBaseUrl()}${endpoint}`,
    status: 200,
    code: null,
    message: null,
  };
}

function errorDebug(endpoint: string, err: unknown): CreditsRequestDebug {
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

function CreditsLoadErrorCard({ state }: { state: CreditsLoadState }) {
  const isAuth = state.error === "auth";
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertCircle className="h-4 w-4 text-destructive" />
          {isAuth ? "登录状态异常，请重新登录" : "Credits 暂时无法加载"}
        </CardTitle>
        <CardDescription>
          {isAuth
            ? "登录状态异常，请重新登录。"
            : "Credits 暂时无法加载，请稍后重试。"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border bg-background p-3 text-xs">
          <div className="mb-2 font-medium text-foreground">DMIT debug</div>
          <div className="flex flex-col gap-2">
            {state.debug.map((item) => (
              <div key={`${item.endpoint}-${item.status}`} className="font-mono">
                <div className="break-all text-muted-foreground">{item.url}</div>
                <div>
                  status={item.status ?? "n/a"} code={item.code ?? "n/a"}
                </div>
                {item.message ? (
                  <div className="break-words text-muted-foreground">
                    {item.message}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CheckoutStatusBanner({
  status,
  checkoutSucceeded,
}: {
  status?: string;
  checkoutSucceeded: boolean;
}) {
  if (checkoutSucceeded || status === "success") {
    return (
      <Card className="border-emerald-300 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Payment received
          </CardTitle>
          <CardDescription className="text-emerald-900/80 dark:text-emerald-100/80">
            Payment received. Credits have been added.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (status === "cancel" || status === "cancelled") {
    return (
      <Card className="border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            Checkout was cancelled
          </CardTitle>
          <CardDescription className="text-amber-900/80 dark:text-amber-100/80">
            No credits were added. You can pick another amount below.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return null;
}

function AmountCell({ amount }: { amount: number | null }) {
  if (amount == null) return <span>—</span>;
  const isPositive = amount >= 0;
  return (
    <span
      className={
        isPositive
          ? "inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
          : "inline-flex items-center gap-1 text-destructive"
      }
    >
      {isPositive ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {formatCredits(Math.abs(amount))}
    </span>
  );
}

function TypeBadge({ type }: { type: string | null | undefined }) {
  if (!type) return <Badge variant="outline">unknown</Badge>;
  const t = type.toLowerCase();
  if (t === "purchase" || t === "topup" || t === "grant" || t === "refund") {
    return <Badge variant="success">{type}</Badge>;
  }
  if (t === "debit") {
    return <Badge variant="destructive">{type}</Badge>;
  }
  if (t === "adjustment") {
    return <Badge variant="warning">{type}</Badge>;
  }
  return <Badge variant="outline">{type}</Badge>;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-16 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <CreditCard className="h-5 w-5" />
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">
        No credit activity yet. Recharge above to add credits, or view plans on
        the pricing page.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild size="sm" variant="default">
          <a href="#recharge-credits">Recharge credits</a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/pricing">View pricing</Link>
        </Button>
      </div>
    </div>
  );
}

function displayReason(reason: string | null | undefined) {
  if (!reason) return "—";
  if (reason === "stripe_checkout_completed") return "Stripe 充值到账";
  if (reason === "Chat completion usage") return "API 调用扣费";
  if (reason === "admin_adjustment") return "管理员调账";
  if (reason === "reverse_duplicate_stripe_topup_ledger_only") {
    return "系统修正";
  }
  return reason;
}
