import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/docs", label: "API reference" },
] as const;

export function PublicFooter() {
  return (
    <footer className="border-t">
      <div className="container flex flex-col gap-4 py-6 text-xs text-muted-foreground sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:py-0">
        <span>© {new Date().getFullYear()} Tokfai</span>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
