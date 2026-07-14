import { redirect } from "next/navigation";

import { AdminTenantsPanel } from "@/components/admin/admin-tenants-panel";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Admin — Tenants",
};

export const dynamic = "force-dynamic";

export default async function AdminTenantsPage() {
  const supabase = createClient();
  if (!supabase) {
    redirect("/login?redirect=/admin");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/tenants");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">分站 / Tenants</h1>
        <p className="text-sm text-muted-foreground">
          管理代理分站、域名绑定、倍率与模型开关。V1 不自动部署 Cloudflare，仅提供
          DNS 说明与手工标记 active。
        </p>
      </div>
      <AdminTenantsPanel />
    </div>
  );
}
