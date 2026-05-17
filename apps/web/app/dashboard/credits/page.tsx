import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
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
import { formatCredits, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { CreditLedgerRow, ProfileRow } from "@/lib/supabase/types";

import { CreditsTopUpClient } from "./credits-top-up-client";

export const metadata = {
  title: "Credits",
};

const LEDGER_COLUMNS =
  "id, created_at, type, amount, balance_after, reason, reference_id";
const PROFILE_COLUMNS =
  "id, email, credits_balance, total_credits_purchased, total_credits_used, updated_at";

export default async function CreditsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard/credits");
  }

  const [profileRes, ledgerRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("credit_ledger")
      .select(LEDGER_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const queryErrors = collectErrors([
    ["profiles", profileRes.error],
    ["credit_ledger", ledgerRes.error],
  ]);

  const profile = (profileRes.data ?? null) as ProfileRow | null;
  const ledger = (ledgerRes.data ?? []) as CreditLedgerRow[];
  const profileMissing = !profileRes.error && !profile;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Credits</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Prepaid balance used by every API call. Reads are RLS-scoped to your
          account.
        </p>
      </div>

      <CheckoutStatusBanner status={searchParams.status} />

      {queryErrors.length > 0 ? (
        <QueryErrorCard errors={queryErrors} />
      ) : null}

      {profileMissing ? <MissingProfileCard userId={user.id} /> : null}

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
                    <th className="py-2 pr-4 font-medium">When</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Amount
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Balance after
                    </th>
                    <th className="py-2 pr-4 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td
                        className="py-2 pr-4 text-muted-foreground"
                        title={entry.reference_id ?? undefined}
                      >
                        {formatDateTime(entry.created_at)}
                      </td>
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
                        {entry.reason ?? "—"}
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

function MissingProfileCard({ userId }: { userId: string }) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Profile could not be found
        </CardTitle>
        <CardDescription>
          Supabase did not return a <code>profiles</code> row for your user.
          Balance data cannot be shown until the profile exists.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="font-mono text-xs text-muted-foreground">
          user.id: {userId}
        </p>
      </CardContent>
    </Card>
  );
}

function CheckoutStatusBanner({ status }: { status?: string }) {
  if (status === "success") {
    return (
      <Card className="border-emerald-300 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Payment started or completed
          </CardTitle>
          <CardDescription className="text-emerald-900/80 dark:text-emerald-100/80">
            Your balance will update after Stripe confirms the payment — DMIT
            will write the ledger entry from the Stripe webhook. Refresh in a
            few seconds if you don&apos;t see it yet.
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

function QueryErrorCard({
  errors,
}: {
  errors: Array<{ source: string; message: string }>;
}) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Some data could not be loaded
        </CardTitle>
        <CardDescription>
          Supabase returned the errors below. Balances may be missing until
          the schema or RLS policy is fixed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1 text-xs">
          {errors.map((e) => (
            <li key={e.source} className="font-mono text-muted-foreground">
              <span className="text-foreground">{e.source}:</span> {e.message}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function collectErrors(
  pairs: Array<readonly [string, { message: string } | null | undefined]>
) {
  const out: Array<{ source: string; message: string }> = [];
  for (const [source, err] of pairs) {
    if (err && typeof err.message === "string") {
      out.push({ source, message: err.message });
    }
  }
  return out;
}
