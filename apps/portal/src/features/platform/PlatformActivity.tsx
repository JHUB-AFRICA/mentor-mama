import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { PortalErrorState } from "../../components/PortalErrorState";
import { getPlatformActivity } from "../../services/api";
import { AdminCard, AdminPage, AdminPageHeader, EmptyState } from "../programme-admin/ui/AdminKit";
import { formatDate } from "./platformUi";
import { ActivitySkeleton } from "./PlatformSkeletons";

export function PlatformActivity() {
  const query = useQuery({ queryKey: ["platform-activity"], queryFn: getPlatformActivity, refetchInterval: 60_000 });
  if (query.isPending) return <ActivitySkeleton />;
  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Platform administration"
        title="Activity"
        description="The latest account and programme changes across the platform: invitations, status changes, sign-in help and new programmes."
      />
      {query.isError ? (
        <PortalErrorState onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState icon={<Activity />} title="No activity yet" />
      ) : (
        <AdminCard flush>
          <ol className="pf-timeline">
            {query.data.map((row) => (
              <li key={row.id}>
                <span className="pf-timeline__dot" aria-hidden="true" />
                <div>
                  <p>
                    <strong>{row.actor}</strong> <span className="pf-muted">({row.actor_role})</span> · {row.title}
                    {row.subject ? (
                      <>
                        {" "}
                        · <strong>{row.subject}</strong>
                      </>
                    ) : null}
                  </p>
                  {row.reason && <p className="pf-muted">“{row.reason}”</p>}
                  <time dateTime={row.occurred_at}>{formatDate(row.occurred_at, true)}</time>
                </div>
              </li>
            ))}
          </ol>
        </AdminCard>
      )}
    </AdminPage>
  );
}
