import type { HTMLAttributes } from "react";

export function Skeleton({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse motion-reduce:animate-none rounded-lg bg-navy/10 ${className}`}
      {...props}
    />
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4 py-3" aria-label="Loading table" role="status">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="grid grid-cols-[minmax(12rem,1.4fr)_minmax(10rem,1fr)_7rem_7rem_10rem] items-center gap-4 border-b border-border pb-4"
        >
          <div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-3 w-44" />
          </div>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  );
}
