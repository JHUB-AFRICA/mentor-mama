import {
  ArrowRight,
  Check,
  CircleHelp,
  LockKeyhole,
  Mail,
  MessageSquare,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Button, Card, Skeleton } from "@mentormama/ui";
import { useQuery } from "@tanstack/react-query";
import { getAccessPolicies, type AccessPolicy } from "../../services/api";

const capabilityLabels: Record<string, string> = {
  create_placement: "Create placements",
  release_placement: "Release placements",
  allocate_ward: "Allocate wards",
  assign_mentor: "Assign mentors",
  pause_placement: "Pause placements",
  resume_placement: "Resume placements",
  complete_placement: "Complete placements",
  archive_placement: "Archive placements",
  withdraw_placement: "Withdraw placements",
  log_session: "Log mentorship sessions",
  confirm_placement: "Confirm placements",
  submit_assessment: "Submit assessments",
  submit_feedback: "Submit feedback",
  open_induction: "Open induction",
  activate_placement: "Activate placements",
  review_escalation: "Review escalations",
  review_feedback: "Review feedback",
  export_reports: "Export reports",
  manage_content: "Manage content",
};

type PolicyGroup = {
  key: string;
  label: string;
  description: string;
  capabilities: string[];
  icon: typeof UserRound;
  tone: string;
  mfaRequired: boolean;
};

function groupPolicies(policies: AccessPolicy[]): PolicyGroup[] {
  const find = (...roles: string[]) =>
    policies.filter((policy) => roles.includes(policy.role));
  const merge = (items: AccessPolicy[]) =>
    [...new Set(items.flatMap((item) => item.capabilities))].sort();
  const groups = [
    {
      key: "student",
      label: "Student",
      description:
        "Access their placements, learning requirements and assigned mentors.",
      icon: UserRound,
      tone: "blue",
      policies: find("student"),
    },
    {
      key: "mentor",
      label: "Clinical Mentor",
      description: "Manage assigned students and complete required training.",
      icon: UserCheck,
      tone: "violet",
      policies: find("mentor"),
    },
    {
      key: "staff",
      label: "Programme Staff",
      description: "Coordinate placements, manage records and support users.",
      icon: UsersRound,
      tone: "green",
      policies: find("coordinator", "nurse_manager"),
    },
    {
      key: "admin",
      label: "Programme Admin",
      description: "Full programme management access.",
      icon: ShieldCheck,
      tone: "orange",
      policies: find("program_admin"),
    },
  ];
  return groups.map(({ policies: items, ...group }) => ({
    ...group,
    capabilities: merge(items),
    mfaRequired: items.some((item) => item.mfa_required),
  }));
}

function ReadOnlyToggle({
  checked,
  label,
}: {
  checked: boolean;
  label: string;
}) {
  return (
    <span
      className="access-policy-toggle"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled="true"
    >
      <span />
    </span>
  );
}

export function AccessPolicyPanel({
  onError,
}: {
  onError: (message: string) => void;
}) {
  const policies = useQuery({
    queryKey: ["access-policies"],
    queryFn: getAccessPolicies,
  });

  if (policies.isPending) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,.8fr)]">
        <Skeleton className="h-[38rem]" />
        <Skeleton className="h-[28rem]" />
      </div>
    );
  }
  if (policies.isError) {
    return (
      <Card padding="sm">
        <p className="font-body text-sm text-error">
          We could not load the access policy.
        </p>
        <Button
          className="mt-4"
          size="sm"
          onClick={() => void policies.refetch()}
        >
          Try again
        </Button>
      </Card>
    );
  }

  const groups = groupPolicies(policies.data);
  const capabilities = [
    ...new Set(policies.data.flatMap((policy) => policy.capabilities)),
  ];
  const adminPolicy = policies.data.find(
    (policy) => policy.role === "program_admin",
  );
  const mfaEnabled = policies.data.some((policy) => policy.mfa_required);

  return (
    <div className="access-policy-layout">
      <Card padding="sm" className="access-policy-card">
        <div className="access-policy-title">
          <span className="access-policy-title-icon">
            <ShieldCheck size={24} />
          </span>
          <div>
            <h3 className="font-display text-xl font-bold text-navy">
              Access policy
            </h3>
            <p className="mt-1 font-body text-sm text-navy-muted">
              Define who can access the programme, what they can do, and any
              additional security rules.
            </p>
          </div>
        </div>
        <div className="access-policy-section">
          <div className="access-policy-section-heading">
            <div>
              <h4 className="font-display text-lg font-bold text-navy">
                Role permissions
              </h4>
              <p className="mt-1 font-body text-sm text-navy-muted">
                Review the default permissions for each role in this programme.
              </p>
            </div>
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              onClick={() =>
                onError(
                  "Role permissions are managed by the server policy and cannot be edited from this view.",
                )
              }
            >
              <SlidersHorizontal size={15} className="mr-2" />
              Edit roles
            </Button>
          </div>
          <div className="access-policy-role-list">
            {groups.map((group) => {
              const Icon = group.icon;
              return (
                <details key={group.key} className="access-policy-role">
                  <summary>
                    <span
                      className={`access-policy-role-icon access-policy-role-icon--${group.tone}`}
                    >
                      <Icon size={19} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong>{group.label}</strong>
                      <small>{group.description}</small>
                    </span>
                    <span className="access-policy-role-count">
                      {`${group.capabilities.length} capabilities`}
                    </span>
                    <ArrowRight size={17} className="access-policy-chevron" />
                  </summary>
                  <ul>
                    {group.capabilities.map((capability) => (
                      <li key={capability}>
                        <Check size={14} />
                        {capabilityLabels[capability] ?? capability}
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
        </div>
        <div className="access-policy-section">
          <div>
            <h4 className="font-display text-lg font-bold text-navy">
              Additional access rules
            </h4>
            <p className="mt-1 font-body text-sm text-navy-muted">
              Security rules enforced across the programme.
            </p>
          </div>
          <div className="access-policy-rules">
            <div>
              <span className="access-policy-rule-icon">
                <UserCheck size={18} />
              </span>
              <span>
                <strong>Require account approval</strong>
                <small>
                  New users must be approved by a programme admin before access.
                </small>
              </span>
              <ReadOnlyToggle checked label="Require account approval" />
            </div>
            <div>
              <span className="access-policy-rule-icon">
                <Mail size={18} />
              </span>
              <span>
                <strong>Enforce institutional email</strong>
                <small>
                  Institutional-domain restriction is not exposed by the current
                  policy contract.
                </small>
              </span>
              <ReadOnlyToggle
                checked={false}
                label="Enforce institutional email"
              />
            </div>
            <div>
              <span className="access-policy-rule-icon">
                <LockKeyhole size={18} />
              </span>
              <span>
                <strong>Require MFA for administrators</strong>
                <small>
                  Programme administrators and elevated staff roles require MFA.
                </small>
              </span>
              <ReadOnlyToggle
                checked={mfaEnabled}
                label="Require MFA for administrators"
              />
            </div>
          </div>
        </div>
        <div className="access-policy-readonly">
          <ShieldCheck size={16} />
          Policy changes are server-enforced. This screen is a live read-only
          summary.
        </div>
      </Card>

      <aside className="access-policy-sidebar">
        <Card padding="sm" id="access-policy-summary">
          <h3 className="font-display text-lg font-bold text-navy">
            Policy summary
          </h3>
          <div className="access-policy-summary-stats">
            <div>
              <UsersRound size={19} />
              <strong>{groups.length}</strong>
              <span>Roles configured</span>
            </div>
            <div>
              <SlidersHorizontal size={19} />
              <strong>{capabilities.length}</strong>
              <span>Total capabilities</span>
            </div>
          </div>
          <div className="access-policy-summary-list">
            <div>
              <UserCheck size={17} />
              <span>Account approval</span>
              <strong>Required</strong>
            </div>
            <div>
              <Mail size={17} />
              <span>Institutional email</span>
              <strong>Not configured</strong>
            </div>
            <div>
              <LockKeyhole size={17} />
              <span>MFA for administrators</span>
              <strong>
                {adminPolicy?.mfa_required || mfaEnabled
                  ? "Enabled"
                  : "Not required"}
              </strong>
            </div>
          </div>
        </Card>
        <Card padding="sm">
          <div className="flex items-start gap-3">
            <span className="access-policy-title-icon access-policy-title-icon--small">
              <UsersRound size={20} />
            </span>
            <div>
              <h3 className="font-display text-lg font-bold text-navy">
                Access request workflow
              </h3>
              <p className="mt-2 font-body text-sm leading-6 text-navy-muted">
                Manage how new users request access to this programme.
              </p>
            </div>
          </div>
          <div className="access-policy-workflow">
            <div>
              <span>Request method</span>
              <strong>Admin invitation only</strong>
              <ArrowRight size={15} />
            </div>
            <div>
              <span>Approver</span>
              <strong>Any programme admin</strong>
              <ArrowRight size={15} />
            </div>
          </div>
        </Card>
        <Card padding="sm" className="access-policy-help">
          <div className="flex items-start gap-3">
            <span className="access-policy-help-icon">
              <CircleHelp size={20} />
            </span>
            <div>
              <h3 className="font-display text-lg font-bold text-navy">
                Need help?
              </h3>
              <p className="mt-2 font-body text-sm leading-6 text-navy-muted">
                Learn more about roles, permissions and access control for your
                programme.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Button
              type="button"
              size="sm"
              variant="tertiary"
              to="mailto:support@mentormama.org?subject=Access policy documentation"
            >
              <MessageSquare size={15} className="mr-2" />
              View documentation
            </Button>
            <Button
              type="button"
              size="sm"
              variant="tertiary"
              to="mailto:support@mentormama.org?subject=Access policy support"
            >
              <MessageSquare size={15} className="mr-2" />
              Contact support
            </Button>
          </div>
        </Card>
      </aside>
    </div>
  );
}
