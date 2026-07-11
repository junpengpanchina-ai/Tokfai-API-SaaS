import { CreditsAdjustClient } from "./credits-adjust-client";

export const metadata = {
  title: "Admin — Credits adjust",
};

export const dynamic = "force-dynamic";

export default function AdminCreditsAdjustPage() {
  return <CreditsAdjustClient />;
}
