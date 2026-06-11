import { LoginPageContent } from "./login-page-content";

export const metadata = {
  title: "Log in",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; redirect?: string; error?: string };
}) {
  return (
    <LoginPageContent
      nextPath={searchParams.next}
      legacyRedirect={searchParams.redirect}
      initialError={searchParams.error}
    />
  );
}
