import { Skeleton } from "@mentormama/ui";
import { AdminCard, AdminPage } from "../programme-admin/ui/AdminKit";

/**
 * Loading placeholders that match each platform page's real layout, so nothing jumps when data arrives.
 * Each wrapper is announced once as "Loading …" and the shapes themselves are hidden from screen readers.
 */
function Announce({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label={`Loading ${label}`}>
      <span className="sr-only">Loading {label}…</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

export function HeaderSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div className="pf-sk-header">
      <div className="pf-sk-stack">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-[min(34rem,90%)]" />
      </div>
      {actions > 0 && (
        <div className="pf-sk-row">
          {Array.from({ length: actions }, (_, index) => (
            <Skeleton key={index} className="h-10 w-36 rounded-xl" />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="pf-sk-stat">
      <Skeleton className="size-11 rounded-full" />
      <div className="pf-sk-stack">
        <Skeleton className="h-6 w-12" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-2.5 w-36" />
      </div>
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <AdminPage>
      <Announce label="platform overview">
        <HeaderSkeleton />
        <div className="pf-sk-stats">
          {Array.from({ length: 4 }, (_, index) => (
            <StatCardSkeleton key={index} />
          ))}
        </div>
        <div className="pf-columns pf-sk-gap">
          <AdminCard flush>
            <div className="pf-sk-card-head">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="pf-check">
                <Skeleton className="size-8 rounded-[10px]" />
                <div className="pf-sk-stack">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </AdminCard>
          <AdminCard>
            <div className="pf-sk-stack pf-sk-gap-sm">
              <Skeleton className="h-4 w-36" />
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="pf-sk-row pf-sk-between">
                  <div className="pf-sk-row">
                    <Skeleton className="size-9 rounded-full" />
                    <Skeleton className="h-3.5 w-36" />
                  </div>
                  <Skeleton className="h-4 w-6" />
                </div>
              ))}
            </div>
          </AdminCard>
        </div>
      </Announce>
    </AdminPage>
  );
}

/** Rows only: the page header, tabs and filters stay real while the list refreshes. */
export function TableRowsSkeleton({ rows = 8, columns = 5, label = "accounts" }: { rows?: number; columns?: number; label?: string }) {
  return (
    <AdminCard flush>
      <Announce label={label}>
        <div className="pf-sk-table">
          <div className="pf-sk-table__row pf-sk-table__head" style={{ gridTemplateColumns: `2fr repeat(${columns - 1}, 1fr)` }}>
            {Array.from({ length: columns }, (_, index) => (
              <Skeleton key={index} className="h-2.5 w-16" />
            ))}
          </div>
          {Array.from({ length: rows }, (_, row) => (
            <div key={row} className="pf-sk-table__row" style={{ gridTemplateColumns: `2fr repeat(${columns - 1}, 1fr)` }}>
              <div className="pf-sk-stack">
                <Skeleton className={`h-3.5 ${row % 2 ? "w-32" : "w-40"}`} />
                <Skeleton className="h-3 w-48 max-w-full" />
              </div>
              {Array.from({ length: columns - 1 }, (_, column) => (
                <Skeleton key={column} className={`h-3.5 ${column === columns - 2 ? "w-20 justify-self-end" : column % 2 ? "w-16" : "w-24"}`} />
              ))}
            </div>
          ))}
        </div>
      </Announce>
    </AdminCard>
  );
}

export function TablePageSkeleton({ label, filters = 0, actions = 1 }: { label: string; filters?: number; actions?: number }) {
  return (
    <AdminPage>
      <Announce label={label}>
        <HeaderSkeleton actions={actions} />
        {filters > 0 && (
          <div className="pf-sk-row pf-sk-gap">
            {Array.from({ length: filters }, (_, index) => (
              <Skeleton key={index} className={`h-11 rounded-xl ${index === 0 ? "w-72" : "w-44"}`} />
            ))}
          </div>
        )}
      </Announce>
      <TableRowsSkeleton label={label} />
    </AdminPage>
  );
}

export function SupportSkeleton() {
  return (
    <AdminPage>
      <Announce label="support requests">
        <HeaderSkeleton actions={0} />
        <Skeleton className="pf-sk-gap h-14 w-full rounded-xl" />
        <div className="pf-sk-row pf-sk-gap">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="pf-requests pf-sk-gap">
          {Array.from({ length: 3 }, (_, index) => (
            <AdminCard key={index}>
              <div className="pf-request">
                <div className="pf-sk-stack">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-72 max-w-full" />
                </div>
                <Skeleton className="h-5 w-32 rounded-full" />
              </div>
              <Skeleton className="mt-3 h-12 w-full rounded-lg" />
              <div className="pf-sk-row mt-3">
                <Skeleton className="h-9 w-40 rounded-xl" />
                <Skeleton className="h-9 w-40 rounded-xl" />
              </div>
            </AdminCard>
          ))}
        </div>
      </Announce>
    </AdminPage>
  );
}

export function ActivitySkeleton() {
  return (
    <AdminPage>
      <Announce label="activity">
        <HeaderSkeleton actions={0} />
        <AdminCard flush>
          <ol className="pf-timeline">
            {Array.from({ length: 8 }, (_, index) => (
              <li key={index}>
                <Skeleton className="mt-1.5 size-2.5 rounded-full" />
                <div className="pf-sk-stack">
                  <Skeleton className={`h-3.5 ${index % 2 ? "w-80" : "w-96"} max-w-full`} />
                  <Skeleton className="h-3 w-32" />
                </div>
              </li>
            ))}
          </ol>
        </AdminCard>
      </Announce>
    </AdminPage>
  );
}
