import {
  ArrowRight,
  Check,
  LockKeyhole,
  Mail,
  MessageSquare,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import {
  AdminButton,
  AdminCard,
  IconTile,
  ListRow,
  Notice,
  StatusPill,
  type Tone,
} from "./ui/AdminKit";
import "./programme-setup-kit.css";
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
  tone: Tone;
  mfaRequired: boolean;
};

function groupPolicies(policies: AccessPolicy[]): PolicyGroup[] {
  const find = (...roles: string[]) =>
    policies.filter((policy) => roles.includes(policy.role));
  const merge = (items: AccessPolicy[]) =>
    [...new Set(items.flatMap((item) => item.capabilities))].sort();
  const groups: Array<Omit<PolicyGroup, "capabilities" | "mfaRequired"> & { policies: AccessPolicy[] }> = [
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
      tone: "amber",
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
      className="ap-switch"
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
      <div className="pd-layout">
        <Skeleton className="h-[38rem]" />
        <Skeleton className="h-[28rem]" />
      </div>
    );
  }
  if (policies.isError) {
    return (
      <AdminCard title="Access policy">
        <p className="font-body text-sm text-error">
          We could not load the access policy.
        </p>
        <AdminButton
          className="mt-4"
          size="sm"
          onClick={() => void policies.refetch()}
        >
          Try again
        </AdminButton>
      </AdminCard>
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
  const rules: Array<{ icon: React.ReactNode; title: string; text: string; checked: boolean }> = [
    {
      icon: <UserCheck />,
      title: "Require account approval",
      text: "New users must be approved by a programme admin before access.",
      checked: true,
    },
    {
      icon: <Mail />,
      title: "Enforce institutional email",
      text: "Institutional-domain restriction is not exposed by the current policy contract.",
      checked: false,
    },
    {
      icon: <LockKeyhole />,
      title: "Require MFA for administrators",
      text: "Programme administrators and elevated staff roles require MFA.",
      checked: mfaEnabled,
    },
  ];

  return (
    <div className="pd-layout">
      <div className="ps-stack">
        <AdminCard
          title="Access policy"
          description="Define who can access the programme, what they can do, and any additional security rules."
        >
          <Notice icon={<ShieldCheck />}>
            Policy changes are server-enforced. This screen is a live
            read-only summary.
          </Notice>
        </AdminCard>
        <AdminCard
          title="Role permissions"
          description="Review the default permissions for each role in this programme."
          flush
          action={
            <AdminButton
              variant="secondary"
              size="sm"
              icon={<SlidersHorizontal />}
              onClick={() =>
                onError(
                  "Role permissions are managed by the server policy and cannot be edited from this view.",
                )
              }
            >
              Edit roles
            </AdminButton>
          }
        >
          <div className="ap-roles">
            {groups.map((group) => {
              const Icon = group.icon;
              return (
                <details key={group.key} className="ap-role">
                  <summary>
                    <IconTile tone={group.tone} size="sm" icon={<Icon />} />
                    <span className="min-w-0 flex-1">
                      <strong>{group.label}</strong>
                      <small>{group.description}</small>
                    </span>
                    <StatusPill tone="neutral" dot={false}>
                      {`${group.capabilities.length} capabilities`}
                    </StatusPill>
                    <ArrowRight size={16} className="ap-chevron" />
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
        </AdminCard>
        <AdminCard
          title="Additional access rules"
          description="Security rules enforced across the programme."
          flush
        >
          <div className="pa-list">
            {rules.map((rule) => (
              <ListRow
                key={rule.title}
                icon={rule.icon}
                tone="teal"
                title={<span className="ap-wrap">{rule.title}</span>}
                meta={<span className="ap-wrap">{rule.text}</span>}
                trailing={<ReadOnlyToggle checked={rule.checked} label={rule.title} />}
              />
            ))}
          </div>
        </AdminCard>
      </div>

      <aside className="ps-stack">
        <div id="access-policy-summary" className="ps-stack">
          <AdminCard title="Policy summary" flush>
            <div className="pa-list">
              <ListRow
                icon={<UsersRound />}
                tone="blue"
                title="Roles configured"
                value={groups.length}
              />
              <ListRow
                icon={<SlidersHorizontal />}
                tone="violet"
                title="Total capabilities"
                value={capabilities.length}
              />
              <ListRow
                icon={<UserCheck />}
                tone="teal"
                title="Account approval"
                trailing={<StatusPill tone="success">Required</StatusPill>}
              />
              <ListRow
                icon={<Mail />}
                tone="slate"
                title={<span className="ap-wrap">Institutional email</span>}
                trailing={<StatusPill tone="neutral">Not configured</StatusPill>}
              />
              <ListRow
                icon={<LockKeyhole />}
                tone="amber"
                title={<span className="ap-wrap">MFA for administrators</span>}
                trailing={
                  adminPolicy?.mfa_required || mfaEnabled ? (
                    <StatusPill tone="success">Enabled</StatusPill>
                  ) : (
                    <StatusPill tone="warning">Not required</StatusPill>
                  )
                }
              />
            </div>
          </AdminCard>
        </div>
        <AdminCard title="Access request workflow" flush>
          <div className="pa-list">
            <ListRow
              icon={<UsersRound />}
              tone="green"
              title="Request method"
              meta="Admin invitation only"
            />
            <ListRow
              icon={<UserCheck />}
              tone="teal"
              title="Approver"
              meta="Any programme admin"
            />
          </div>
        </AdminCard>
        <AdminCard title="Need help?">
          <p className="ps-copy">
            Learn more about roles, permissions and access control for your
            programme.
          </p>
          <div className="ps-actions-col">
            <a
              className="pa-btn pa-btn--secondary pa-btn--sm"
              href="mailto:support@mentormama.org?subject=Access policy documentation"
            >
              <MessageSquare />
              View documentation
            </a>
            <a
              className="pa-btn pa-btn--secondary pa-btn--sm"
              href="mailto:support@mentormama.org?subject=Access policy support"
            >
              <MessageSquare />
              Contact support
            </a>
          </div>
        </AdminCard>
      </aside>
    </div>
  );
}
