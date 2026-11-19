/** Lightweight placeholder shown only for the moment a page chunk takes to arrive. */
export function PageFallback() {
  return (
    <div className="space-y-4 pt-2" role="status" aria-live="polite" aria-label="Loading">
      <div className="h-10 w-2/3 max-w-xs animate-pulse rounded-2xl bg-blush/70" />
      <div className="h-5 w-1/2 max-w-sm animate-pulse rounded-xl bg-blush/50" />
      <div className="grid gap-4 pt-4 sm:grid-cols-2">
        <div className="h-40 animate-pulse rounded-[2rem] bg-blush/50" />
        <div className="h-40 animate-pulse rounded-[2rem] bg-blush/40" />
      </div>
    </div>
  );
}