export function adminCreditsAdjustHref(args: {
  userId: string;
  email: string | null;
  direction: "add" | "deduct";
}): string {
  const params = new URLSearchParams({ direction: args.direction });
  const trimmedEmail = args.email?.trim();
  if (trimmedEmail) {
    params.set("email", trimmedEmail);
  } else {
    params.set("user_id", args.userId);
  }
  return `/admin/credits-adjust?${params.toString()}`;
}
