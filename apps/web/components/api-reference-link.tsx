import Link from "next/link";

import { cn } from "@/lib/utils";

const API_REFERENCE_HREF = "/dashboard/docs";

export function ApiReferenceLink({
  className,
  children = "API reference →",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={API_REFERENCE_HREF}
      className={cn("transition-colors hover:text-foreground", className)}
    >
      {children}
    </Link>
  );
}

export { API_REFERENCE_HREF };
