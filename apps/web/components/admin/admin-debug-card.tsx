import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AdminDebug } from "@/lib/admin/server";

export function AdminDebugCard({ debug }: { debug: AdminDebug }) {
  const title = debug.isForbidden ? "Admin access denied" : "Admin error";
  const description = debug.isForbidden
    ? "Current user is not in the TOKFAI_ADMIN_EMAILS allowlist."
    : debug.message;

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <DebugRow label="Status code" value={debug.statusCode} />
          <DebugRow label="Error message" value={debug.message} />
          <DebugRow label="API base URL" value={debug.dmitBaseUrl} />
          <DebugRow
            label="Has session access token"
            value={debug.hasAccessToken ? "yes" : "no"}
          />
          <DebugRow label="Current user email" value={debug.userEmail ?? "—"} />
        </dl>
      </CardContent>
    </Card>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words font-mono text-xs">{value}</dd>
    </div>
  );
}
