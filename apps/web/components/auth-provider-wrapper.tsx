import { AuthProvider } from "@/lib/auth/auth-provider";
import { createClient } from "@/lib/supabase/server";

export async function AuthProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  let initialUser = null;

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    initialUser = user;
  }

  return <AuthProvider initialUser={initialUser}>{children}</AuthProvider>;
}
