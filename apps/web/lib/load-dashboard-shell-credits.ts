import { createClient } from "@/lib/supabase/server";

import {
  EMPTY_SHELL_CREDITS,
  type DashboardShellCredits,
} from "@/lib/dashboard-shell-credits";

export async function loadDashboardShellCredits(
  userId: string
): Promise<DashboardShellCredits> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("credits_balance")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      return EMPTY_SHELL_CREDITS;
    }

    const raw = data?.credits_balance;
    if (raw == null) {
      return { balance: 0, loaded: true };
    }

    const balance = typeof raw === "number" ? raw : Number(raw);
    return {
      balance: Number.isFinite(balance) ? balance : 0,
      loaded: true,
    };
  } catch {
    return EMPTY_SHELL_CREDITS;
  }
}
