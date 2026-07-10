import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { fetchDmitAdmin } from "@/lib/admin/server";
import type { AdminCreditOrderListItem } from "@/lib/admin/client";
import { DmitServerError, getDmitBaseUrl } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

import { AdminCreditOrdersClient } from "./admin-credit-orders-client";

export const metadata = {
  title: "Admin — Credit orders",
};

export const dynamic = "force-dynamic";

type CreditOrdersResponse = {
  data?: AdminCreditOrderListItem[];
};

type StatusFilter = "all" | "pending" | "paid" | "cancelled" | "failed";

function parseStatusFilter(raw: string | undefined): StatusFilter {
  switch ((raw ?? "").trim().toLowerCase()) {
    case "pending":
    case "paid":
    case "cancelled":
    case "failed":
      return raw!.trim().toLowerCase() as StatusFilter;
    default:
      return "all";
  }
}

function buildCreditOrdersUrl(
  baseUrl: string,
  searchParams: {
    email?: string;
    status?: string;
    package_code?: string;
  }
): string {
  const params = new URLSearchParams();
  const email = searchParams.email?.trim();
  const status = parseStatusFilter(searchParams.status);
  const packageCode = searchParams.package_code?.trim();

  if (email) params.set("email", email);
  if (status !== "all") params.set("status", status);
  if (packageCode) params.set("package_code", packageCode);

  const query = params.toString();
  return `${baseUrl}/admin/credit-orders${query ? `?${query}` : ""}`;
}

export default async function AdminCreditOrdersPage({
  searchParams,
}: {
  searchParams: {
    email?: string;
    status?: string;
    package_code?: string;
  };
}) {
  noStore();
  const supabase = createClient();
  if (!supabase) {
    redirect("/login?redirect=/admin");
  }
  const dmitBaseUrl = getDmitBaseUrl();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/credit-orders");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;

  if (!session || !accessToken) {
    redirect("/login?redirect=/admin/credit-orders");
  }

  const initialEmailFilter = (searchParams.email ?? "").trim();
  const initialStatusFilter = parseStatusFilter(searchParams.status);
  const initialPackageCodeFilter = (searchParams.package_code ?? "").trim();

  let initialOrders: AdminCreditOrderListItem[] = [];
  let initialError: string | null = null;

  try {
    const body = await fetchDmitAdmin<CreditOrdersResponse>(
      buildCreditOrdersUrl(dmitBaseUrl, searchParams),
      accessToken
    );
    initialOrders = Array.isArray(body.data) ? body.data : [];
  } catch (error) {
    if (error instanceof DmitServerError) {
      initialError =
        error.status === 403
          ? "Your account is not authorized for admin access."
          : error.message;
    } else if (error instanceof Error) {
      initialError = error.message;
    } else {
      initialError = "Credit orders could not be loaded.";
    }
  }

  return (
    <AdminCreditOrdersClient
      initialOrders={initialOrders}
      initialError={initialError}
      initialEmailFilter={initialEmailFilter}
      initialStatusFilter={initialStatusFilter}
      initialPackageCodeFilter={initialPackageCodeFilter}
    />
  );
}
