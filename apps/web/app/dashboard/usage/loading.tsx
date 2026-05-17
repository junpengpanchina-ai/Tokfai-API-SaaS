import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function UsageLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Usage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Loading your recent API calls...
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {["Total requests", "Succeeded", "Failed", "Cost used"].map(
          (label) => (
            <Card key={label}>
              <CardHeader className="pb-2">
                <CardDescription>{label}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-9 w-24 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          )
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent requests</CardTitle>
          <CardDescription>Loading the latest usage logs.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">When</th>
                  <th className="py-2 pr-4 font-medium">Model</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 text-right font-medium">Prompt</th>
                  <th className="py-2 pr-4 text-right font-medium">
                    Completion
                  </th>
                  <th className="py-2 pr-4 text-right font-medium">Total</th>
                  <th className="py-2 pr-4 text-right font-medium">Credits</th>
                  <th className="py-2 pr-4 font-medium">Request ID</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index} className="border-b last:border-0">
                    {Array.from({ length: 8 }).map((__, cellIndex) => (
                      <td key={cellIndex} className="py-3 pr-4">
                        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
