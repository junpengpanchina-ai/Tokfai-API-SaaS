import { cn } from "@/lib/utils";

export function ResponsiveTableScroll({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("-mx-1 overflow-x-auto px-1", className)}>{children}</div>
  );
}
