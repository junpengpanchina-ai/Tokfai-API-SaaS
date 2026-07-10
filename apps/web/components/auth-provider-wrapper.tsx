import { AuthProvider } from "@/lib/auth/auth-provider";
import { createClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

export async function AuthProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  let initialUser = null;

  if (hasSupabaseServerEnv()) {
    try {
      const supabase = createClient();
      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        initialUser = user;
      }
    } catch {
      initialUser = null;
    }
  }

  return <AuthProvider initialUser={initialUser}>{children}</AuthProvider>;
}
