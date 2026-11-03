import { cn } from "@/lib/utils";

function Bar({ className }: { className?: string }) {
  return <div className={cn("rounded-md bg-line/70 motion-safe:animate-pulse", className)} />;
}

/** Quiet placeholder with the shape of a typical page while its data loads. */
export function PageSkeleton({ withStats = true }: { withStats?: boolean }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="mb-6 space-y-2">
        <Bar className="h-3 w-32" />
        <Bar className="h-6 w-64" />
        <Bar className="h-3 w-80 max-w-full" />
      </div>
      {withStats && (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-line bg-white px-4 py-3.5">
              <Bar className="h-3 w-24" />
              <Bar className="mt-3 h-6 w-12" />
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-lg border border-line bg-white">
          <div className="p-4">
            <Bar className="h-4 w-40" />
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 border-t border-line px-4 py-3">
              <Bar className="h-5 w-5 rounded-full" />
              <Bar className="h-3 flex-1" />
              <Bar className="h-3 w-16" />
            </div>
          ))}
        </div>
        <div className="hidden space-y-5 xl:block">
          <div className="rounded-lg border border-line bg-white p-4">
            <Bar className="h-4 w-28" />
            <Bar className="mt-4 h-3 w-full" />
            <Bar className="mt-2 h-3 w-3/4" />
          </div>
        </div>
      </div>
    </div>
  );
}
