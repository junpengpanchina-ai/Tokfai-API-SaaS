export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading dashboard">
      <div className="space-y-2">
        <div className="h-9 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-full max-w-2xl animate-pulse rounded-md bg-muted" />
      </div>

      <div className="h-36 animate-pulse rounded-lg border bg-muted/30" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-lg border bg-muted/20"
          />
        ))}
      </div>

      <div className="h-64 animate-pulse rounded-lg border bg-muted/20" />
    </div>
  );
}
