import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { fetchDmitAdmin } from "@/lib/admin/server";
import { DmitServerError, getDmitBaseUrl } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

import {
  AdminCreditsClient,
  type AdminCreditsData,
  type AdminUserProfile,
} from "./admin-credits-client";

export const metadata = {
  title: "Admin — Credits",
};

export const dynamic = "force-dynamic";

type CreditsResponse = {
  data?: AdminCreditsData;
};

type UsersResponse = {
  data?: AdminUserProfile[];
};

export default async function AdminCreditsPage({
  searchParams,
}: {
  searchParams: { email?: string };
}) {
  noStore();
  const supabase = createClient();
  const dmitBaseUrl = getDmitBaseUrl();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/credits");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;

  if (!session || !accessToken) {
    redirect("/login?redirect=/admin/credits");
  }

  const initialEmail = (searchParams.email ?? "").trim();
  let initialData: AdminCreditsData | null = null;
  let initialError: string | null = null;
  let initialUsers: AdminUserProfile[] = [];

  try {
    const usersRes = await fetchDmitAdmin<UsersResponse>(
      `${dmitBaseUrl}/admin/users`,
      accessToken
    );
    initialUsers = Array.isArray(usersRes.data) ? usersRes.data : [];
  } catch (error) {
    if (error instanceof DmitServerError && error.status === 403) {
      initialError = "Your account is not authorized for admin access.";
    } else if (error instanceof Error) {
      initialError = error.message;
    }
  }

  if (initialEmail && !initialError) {
    try {
      const url = new URL(`${dmitBaseUrl}/admin/credits`);
      url.searchParams.set("email", initialEmail);
      url.searchParams.set("limit", "50");

      const body = await fetchDmitAdmin<CreditsResponse>(url.toString(), accessToken);
      initialData = body.data ?? null;
    } catch (error) {
      if (error instanceof DmitServerError) {
        if (error.status === 403) {
          initialError = "Your account is not authorized for admin access.";
        } else if (error.status === 404) {
          initialError = `No profile found for ${initialEmail}.`;
        } else {
          initialError = error.message;
        }
      } else if (error instanceof Error) {
        initialError = error.message;
      } else {
        initialError = "Credits data could not be loaded.";
      }
    }
  }

  return (
    <AdminCreditsClient
      accessToken={accessToken}
      initialEmail={initialEmail}
      initialData={initialData}
      initialError={initialError}
      initialUsers={initialUsers}
    />
  );
}
