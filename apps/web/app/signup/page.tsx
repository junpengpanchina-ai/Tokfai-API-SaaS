import { SignupPageContent } from "./signup-page-content";

export const metadata = {
  title: "Sign up",
};

export default function SignupPage({
  searchParams,
}: {
  searchParams: { next?: string; redirect?: string };
}) {
  return (
    <SignupPageContent
      nextPath={searchParams.next}
      legacyRedirect={searchParams.redirect}
    />
  );
}
