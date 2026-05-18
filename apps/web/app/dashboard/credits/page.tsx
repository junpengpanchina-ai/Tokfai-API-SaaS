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
    redirect("/login?redirect=/dashboard/credits");
  }

  const [profile, ledger] = await Promise.all([
    getMyCredits(session.access_token),
    listMyCreditLedger(session.access_token, 50),
  ]);
  const checkoutSucceeded =
    searchParams.success === "true" || Boolean(searchParams.session_id);

  return (
    <div className="flex flex-col gap-6">
      <CreditsReturnRefresh
        shouldRefresh={checkoutSucceeded}
        sessionId={searchParams.session_id}
      />

      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Credits</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Prepaid balance used by every API call. Data is loaded through DMIT
          with your Supabase session.
        </p>
      </div>

      <CheckoutStatusBanner
        status={searchParams.status}
        checkoutSucceeded={checkoutSucceeded}
      />

      <Card>
        <CardHeader>
          <CardDescription>Current balance</CardDescription>
          <CardTitle className="text-4xl">
            {profile ? formatCredits(profile.credits_balance) : "Unavailable"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-muted-foreground">
          <div>
            Total purchased:{" "}
            <span className="font-medium text-foreground">
              {profile
                ? formatCredits(profile.total_credits_purchased)
                : "Unavailable"}
            </span>
          </div>
          <div>
            Total used:{" "}
            <span className="font-medium text-foreground">
              {profile
                ? formatCredits(profile.total_credits_used)
                : "Unavailable"}
            </span>
          </div>
          <div>
            Last updated:{" "}
            <span className="font-medium text-foreground">
              {profile ? formatDateTime(profile.updated_at) : "Unavailable"}
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
          {ledger.length === 0 ? (
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
                  {ledger.map((entry) => (
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
      <p className="text-sm text-muted-foreground">No credit activity yet.</p>
      <Button asChild size="sm" variant="outline">
        <Link href="/pricing">See pricing</Link>
      </Button>
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
