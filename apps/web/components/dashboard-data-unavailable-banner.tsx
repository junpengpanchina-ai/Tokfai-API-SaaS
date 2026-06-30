export function DashboardDataUnavailableBanner() {
  return (
    <div
      role="status"
      className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
    >
      Dashboard data temporarily unavailable. Tokfai API remains available.
    </div>
  );
}
