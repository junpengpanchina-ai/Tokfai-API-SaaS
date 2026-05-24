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

      <Card>
        <CardHeader>
          <CardTitle>Recent requests</CardTitle>
          <CardDescription>Loading the latest usage logs.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Model</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="hidden py-2 pr-3 text-right font-medium md:table-cell">
                    Prompt
                  </th>
                  <th className="hidden py-2 pr-3 text-right font-medium lg:table-cell">
                    Completion
                  </th>
                  <th className="hidden py-2 pr-3 text-right font-medium sm:table-cell">
                    Total
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">Credits</th>
                  <th className="hidden py-2 pr-3 font-medium xl:table-cell">
                    Request ID
                  </th>
                  <th className="hidden py-2 pr-0 font-medium lg:table-cell">
                    Error
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index} className="border-b last:border-0">
                    {Array.from({ length: 10 }).map((__, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={`py-3 pr-3 ${
                          cellIndex === 4
                            ? "hidden md:table-cell"
                            : cellIndex === 5 || cellIndex === 9
                              ? "hidden lg:table-cell"
                              : cellIndex === 6
                                ? "hidden sm:table-cell"
                                : cellIndex === 8
                                  ? "hidden xl:table-cell"
                                  : ""
                        }`}
                      >
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
