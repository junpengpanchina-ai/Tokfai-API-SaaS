import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminDebugCard } from "@/components/admin/admin-debug-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchDmitAdmin, toAdminDebug } from "@/lib/admin/server";
import {
  formatCredits,
  formatDateTime,
  formatInt,
} from "@/lib/format";
import { getDmitBaseUrl } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Admin — Users",
};

export const dynamic = "force-dynamic";

type AdminUser = {
  id: string;
  email: string | null;
  credits_balance: number;
  total_credits_used: number;
  updated_at: string | null;
};

type UsersResponse = {
  data?: AdminUser[];
};

export default async function AdminUsersPage() {
  noStore();
  const supabase = createClient();
  const dmitBaseUrl = getDmitBaseUrl();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/users");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;

  if (!session || !accessToken) {
    redirect("/login?redirect=/admin/users");
  }

  let users: AdminUser[] = [];
  let debug = null;

  try {
    const body = await fetchDmitAdmin<UsersResponse>(
      `${dmitBaseUrl}/admin/users`,
      accessToken
    );
    users = Array.isArray(body.data) ? body.data : [];
  } catch (error) {
    debug = toAdminDebug(error, {
      dmitBaseUrl,
      hasAccessToken: true,
      userEmail: user.email ?? null,
    });
  }

  return (
    <>
      <div>
        <Badge variant="secondary">Admin tools</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only account overview. Request counts and API key totals will
          connect in the next phase.
        </p>
      </div>

      {debug ? <AdminDebugCard debug={debug} /> : null}

      <Card className="border-muted bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Coming soon</CardTitle>
          <CardDescription>
            Per-user API key counts, total requests, and last activity require
            additional admin aggregates. Profile balances below are live.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User profiles</CardTitle>
          <CardDescription>
            {formatInt(users.length)} accounts from the admin users endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Credits balance
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      API keys count
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Total requests
                    </th>
                    <th className="py-2 pr-4 font-medium">Last activity</th>
                    <th className="py-2 pr-4 font-medium">Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{row.email ?? "—"}</td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">
                        {formatCredits(row.credits_balance)}
                      </td>
                      <td className="py-2 pr-4 text-right text-muted-foreground">
                        —
                      </td>
                      <td className="py-2 pr-4 text-right text-muted-foreground">
                        —
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {formatDateTime(row.updated_at)}
                      </td>
                      <td className="py-2 pr-4">
                        {row.email ? (
                          <Link
                            href={`/admin/credits?email=${encodeURIComponent(row.email)}`}
                            className="text-sm font-medium underline-offset-4 hover:underline"
                          >
                            Ledger
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              No user profiles found.
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
