import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import {
  UsageViewClient,
  type UsageState,
} from "@/components/usage-view-client";
import { DmitServerError, listMyUsage } from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Usage",
};

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  noStore();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard/usage");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return (
      <UsageViewClient
        state={{
          status: "error",
          message: "请重新登录",
          code: "missing_session",
          httpStatus: 401,
        }}
      />
    );
  }

  const state = await loadUsage(session.access_token);
  return <UsageViewClient state={state} />;
}

async function loadUsage(accessToken: string): Promise<UsageState> {
  try {
    const logs = await listMyUsage(accessToken, 50);
    return { status: "ready", logs };
  } catch (err) {
    if (err instanceof DmitServerError) {
      return {
        status: "error",
        message:
          err.status === 401 || err.status === 403
            ? "请重新登录"
            : "Usage 暂时无法加载，请稍后重试",
        code: err.code,
        httpStatus: err.status,
      };
    }
    return {
      status: "error",
      message: "Usage 暂时无法加载，请稍后重试",
    };
  }
}
