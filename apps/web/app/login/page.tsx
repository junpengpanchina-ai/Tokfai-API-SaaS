import Link from "next/link";

import { LoginForm } from "./login-form";

export const metadata = {
  title: "Log in",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { redirect?: string; error?: string };
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground font-bold">
              T
            </div>
            <span className="text-lg font-semibold tracking-tight">
              Tokfai
            </span>
          </Link>
        </div>
        <LoginForm
          redirectTo={searchParams.redirect}
          initialError={searchParams.error}
        />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link
            href="/signup"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
