import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LifeBuoy, XCircle } from "lucide-react";
import { PortalErrorState } from "../../components/PortalErrorState";
import { useToast } from "../../components/ToastProvider";
import { ApiError, getPlatformSupportRequests, resolvePlatformSupportRequest, type PlatformSupportRequest } from "../../services/api";
import { AdminButton, AdminCard, AdminPage, AdminPageHeader, AdminTabs, EmptyState, Notice, StatusPill } from "../programme-admin/ui/AdminKit";
import { ReasonDialog, formatDate } from "./platformUi";
import { SupportSkeleton } from "./PlatformSkeletons";

type Pending = { decision: "recover" | "close"; request: PlatformSupportRequest } | null;

export function PlatformSupport({ onError }: { onError: (message: string) => void }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [tab, setTab] = useState<"pending" | "reviewed">("pending");
  const [pending, setPending] = useState<Pending>(null);
  const query = useQuery({ queryKey: ["platform-support"], queryFn: getPlatformSupportRequests, refetchInterval: 60_000 });
  const resolve = useMutation({
    mutationFn: ({ decision, request, reason }: { decision: "recover" | "close"; request: PlatformSupportRequest; reason: string }) =>
      resolvePlatformSupportRequest(request.id, decision, reason),
    onSuccess: (_, { decision, request }) => {
      void queryClient.invalidateQueries({ queryKey: ["platform-support"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
      setPending(null);
      pushToast({
        kind: "success",
        title: decision === "recover" ? "Authenticator reset" : "Request closed",
        message:
          decision === "recover"
            ? `${request.account.email} can sign in with their password and set up a new authenticator.`
            : `${request.account.email} was told the request was reviewed.`,
      });
    },
    onError: (cause) => onError(cause instanceof ApiError ? cause.message : "We could not review this request."),
  });

  if (query.isPending) return <SupportSkeleton />;
  if (query.isError) return <PortalErrorState onRetry={() => void query.refetch()} />;
  const rows = query.data.filter((row) => row.status === tab);
  const waiting = query.data.filter((row) => row.status === "pending").length;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Platform administration"
        title="Sign-in help requests"
        description="People who lost access to their authenticator app. Programme administrators usually handle their own people; requests marked “Needs the platform” have nobody else who can."
      />
      <Notice icon={<KeyRound />}>
        Before resetting, confirm the person’s identity outside MentorMAMA (for example by phone). A reset removes their authenticator and signs them out everywhere.
      </Notice>
      <AdminTabs
        label="Request views"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "pending", label: "Waiting", count: waiting },
          { value: "reviewed", label: "Reviewed" },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={<LifeBuoy />} title={tab === "pending" ? "Nothing waiting" : "No reviewed requests yet"} text={tab === "pending" ? "New requests appear here automatically." : undefined} />
      ) : (
        <div className="pf-requests">
          {rows.map((row) => (
            <AdminCard key={row.id}>
              <div className="pf-request">
                <div className="pf-request__who">
                  <strong>{row.account.name || row.account.email}</strong>
                  <small>
                    {row.account.email} · {row.account.role_label} · {row.account.programme}
                  </small>
                </div>
                <div className="pf-request__tags">
                  {row.handled_by === "platform" ? <StatusPill tone="warning">Needs the platform</StatusPill> : <StatusPill tone="neutral">Programme can handle</StatusPill>}
                  <small>Asked {formatDate(row.created_at, true)}</small>
                </div>
              </div>
              <blockquote className="pf-request__reason">{row.reason}</blockquote>
              {row.status === "pending" ? (
                <div className="pf-actions">
                  <AdminButton size="sm" icon={<KeyRound />} disabled={row.account.status !== "active"} onClick={() => setPending({ decision: "recover", request: row })}>
                    Reset authenticator
                  </AdminButton>
                  <AdminButton variant="secondary" size="sm" icon={<XCircle />} onClick={() => setPending({ decision: "close", request: row })}>
                    Close without reset
                  </AdminButton>
                  {row.account.status !== "active" && <small className="pf-muted">Reactivate the account before resetting its authenticator.</small>}
                </div>
              ) : (
                <small className="pf-muted">Reviewed {formatDate(row.updated_at, true)}</small>
              )}
            </AdminCard>
          ))}
        </div>
      )}
      {pending && (
        <ReasonDialog
          open
          busy={resolve.isPending}
          danger={pending.decision === "recover"}
          title={pending.decision === "recover" ? "Reset this authenticator?" : "Close this request?"}
          description={
            pending.decision === "recover"
              ? `${pending.request.account.email} will be signed out everywhere and asked to set up a new authenticator at their next sign-in.`
              : `${pending.request.account.email} keeps their current authenticator and is told the request was reviewed.`
          }
          confirmLabel={pending.decision === "recover" ? "Reset authenticator" : "Close request"}
          onClose={() => setPending(null)}
          onConfirm={(reason) => resolve.mutate({ decision: pending.decision, request: pending.request, reason })}
        />
      )}
    </AdminPage>
  );
}
