import { CreditsAdjustClient } from "./credits-adjust-client";

export const metadata = {
  title: "Admin — Credits adjust",
};

export const dynamic = "force-dynamic";

export default function AdminCreditsAdjustPage({
  searchParams,
}: {
  searchParams: { user_id?: string; email?: string; direction?: string };
}) {
  const initialUserId = (searchParams.user_id ?? "").trim();
  const initialEmail = (searchParams.email ?? "").trim();
  const initialDirection =
    searchParams.direction === "deduct" ? "deduct" : "add";

  return (
    <CreditsAdjustClient
      initialUserId={initialUserId}
      initialEmail={initialEmail}
      initialDirection={initialDirection}
    />
  );
}
