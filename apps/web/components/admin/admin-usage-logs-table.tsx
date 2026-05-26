import { Badge } from "@/components/ui/badge";
import {
  formatCreditsPrecise,
  formatDateTime,
  formatInt,
  toneForStatus,
} from "@/lib/format";

export type AdminUsageLogRow = {
  id?: string;
  email: string | null;
  model: string | null;
  status: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  credits_charged: number | null;
  request_id: string | null;
  created_at: string | null;
};

export function AdminUsageLogsTable({ rows }: { rows: AdminUsageLogRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
        No usage logs found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Email</th>
            <th className="py-2 pr-4 font-medium">Model</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 text-right font-medium">Prompt</th>
            <th className="py-2 pr-4 text-right font-medium">Completion</th>
            <th className="py-2 pr-4 text-right font-medium">Total</th>
            <th className="py-2 pr-4 text-right font-medium">Credits</th>
            <th className="py-2 pr-4 font-medium">Request ID</th>
            <th className="py-2 pr-4 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id ?? row.request_id ?? `${row.created_at}-${index}`}
              className="border-b last:border-0"
            >
              <td className="py-2 pr-4">{row.email ?? "—"}</td>
              <td className="py-2 pr-4 font-mono text-xs">{row.model ?? "—"}</td>
              <td className="py-2 pr-4">
                <StatusBadge status={row.status} />
              </td>
              <td className="py-2 pr-4 text-right font-mono text-xs">
                {formatMaybeInt(row.prompt_tokens)}
              </td>
              <td className="py-2 pr-4 text-right font-mono text-xs">
                {formatMaybeInt(row.completion_tokens)}
              </td>
              <td className="py-2 pr-4 text-right font-mono text-xs">
                {formatMaybeInt(row.total_tokens)}
              </td>
              <td className="py-2 pr-4 text-right font-mono text-xs">
                {row.credits_charged != null
                  ? formatCreditsPrecise(row.credits_charged)
                  : "—"}
              </td>
              <td
                className="max-w-[14rem] truncate py-2 pr-4 font-mono text-xs text-muted-foreground"
                title={row.request_id ?? undefined}
              >
                {row.request_id ?? "—"}
              </td>
              <td className="py-2 pr-4 text-muted-foreground">
                {formatDateTime(row.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const tone = toneForStatus(status);
  if (!status) return <Badge variant="outline">unknown</Badge>;
  if (tone === "success") return <Badge variant="success">{status}</Badge>;
  if (tone === "warning") return <Badge variant="warning">{status}</Badge>;
  if (tone === "destructive") {
    return <Badge variant="destructive">{status}</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

function formatMaybeInt(value: number | null | undefined): string {
  return value == null ? "—" : formatInt(value);
}
