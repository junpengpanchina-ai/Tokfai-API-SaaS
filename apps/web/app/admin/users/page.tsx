import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { AdminUsersPanel } from "@/components/admin/admin-users-panel";
import { fetchDmitAdmin, toAdminDebug } from "@/lib/admin/server";
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

  return <AdminUsersPanel users={users} debug={debug} />;
}
