import {
  EMPTY_SHELL_CREDITS,
  type DashboardShellCredits,
} from "@/lib/dashboard-shell-credits";
import { tryCreateServerClient } from "@/lib/dashboard-safe/server-session";

export async function loadDashboardShellCredits(
  userId: string
): Promise<DashboardShellCredits> {
  try {
    const supabase = tryCreateServerClient();
    if (!supabase) {
      return EMPTY_SHELL_CREDITS;
    }
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
  } catch (error) {
    console.error("[dashboard-ssr-fail-open]", "loadDashboardShellCredits", error);
    return EMPTY_SHELL_CREDITS;
  }
}
