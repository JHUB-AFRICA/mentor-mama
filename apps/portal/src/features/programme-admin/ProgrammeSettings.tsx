import { useState } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  HelpCircle,
  Info,
  Save,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { LoadingOverlay, Skeleton } from "@mentormama/ui";
import { Field, SelectInput, TextArea, TextInput } from "../../components/kit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  ApiError,
  getAccessPolicies,
  getFacilities,
  getInstitutions,
  getWards,
  getProgrammeSettings,
  confirmProgrammeDirectoryReview,
  updateProgrammeSettings,
} from "../../services/api";
import { ProgrammeDirectory } from "./ProgrammeDirectory";
import { AccessPolicyPanel } from "./AccessPolicyPanel";
import { useToast } from "../../components/ToastProvider";
import {
  AdminButton,
  AdminCard,
  AdminPage,
  AdminPageHeader,
  IconTile,
  Notice,
} from "./ui/AdminKit";
import "./programme-setup-kit.css";
import { supportEmail } from "../../lib/site";

type SetupTab = "identity" | "directory" | "access";

export function ProgrammeSettings({
  onError,
  onInviteRole,
}: {
  onError: (message: string) => void;
  onInviteRole: (role: "coordinator" | "nurse_manager") => void;
}) {
  const { pushToast } = useToast();
  const settings = useQuery({
    queryKey: ["programme-settings"],
    queryFn: getProgrammeSettings,
  });
  const institutions = useQuery({
    queryKey: ["programme-institutions"],
    queryFn: getInstitutions,
  });
  const facilities = useQuery({
    queryKey: ["programme-facilities"],
    queryFn: getFacilities,
  });
  const wards = useQuery({ queryKey: ["programme-wards"], queryFn: getWards });
  const policies = useQuery({
    queryKey: ["access-policies"],
    queryFn: getAccessPolicies,
  });
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get("section");
  const tab: SetupTab =
    requestedSection === "directory" || requestedSection === "access"
      ? requestedSection
      : "identity";
  const [name, setName] = useState<string | null>(null);
  const [shortName, setShortName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [academicYear, setAcademicYear] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [trainingRequired, setTrainingRequired] = useState<boolean | null>(
    null,
  );
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [coverageAcknowledged, setCoverageAcknowledged] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);

  if (settings.isPending) return <SetupSkeleton />;
  if (settings.isError)
    return (
      <AdminPage>
        <AdminCard title="Programme setup">
          <p className="font-body text-sm text-error">
            We could not load programme settings.
          </p>
          <AdminButton
            className="mt-4"
            size="sm"
            onClick={() => void settings.refetch()}
          >
            Try again
          </AdminButton>
        </AdminCard>
      </AdminPage>
    );
  const data = settings.data;
  const currentName = name ?? data.name;
  const currentShortName = shortName ?? data.short_name;
  const currentDescription = description ?? data.description;
  const currentAcademicYear = academicYear ?? data.academic_year;
  const currentOwnerId = ownerId ?? data.owner_id;
  const currentTrainingRequired =
    trainingRequired ?? data.require_mentor_training_before_placement;
  const checksLoading = institutions.isPending || facilities.isPending || wards.isPending;
  const checksError = institutions.isError || facilities.isError || wards.isError;
  const activeInstitutions = institutions.data?.filter((item) => !item.archived_at && item.is_active !== false) ?? [];
  const activeFacilities = facilities.data?.filter((item) => !item.archived_at) ?? [];
  const activeFacilityIds = new Set(activeFacilities.map((facility) => facility.id));
  const activeWards = wards.data?.filter((item) => item.available && activeFacilityIds.has(item.facility_id)) ?? [];
  const directoryComplete = Boolean(activeInstitutions.length && activeFacilities.length && activeWards.length);
  const complete = [Boolean(data.name.trim()), directoryComplete, Boolean(data.directory_reviewed_at)];
  const completed =
    checksLoading || checksError ? null : complete.filter(Boolean).length;
  const now = new Date().getFullYear();
  const years = Array.from(
    { length: 7 },
    (_, index) => `${now - 2 + index} / ${String(now - 1 + index).slice(-2)}`,
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setSaved(false);
    try {
      await updateProgrammeSettings(currentName, currentTrainingRequired, {
        short_name: currentShortName,
        description: currentDescription,
        academic_year: currentAcademicYear,
        owner_id: currentOwnerId,
      });
      setSaved(true);
      pushToast({
        kind: "success",
        title: "Programme settings saved",
        message: "Your programme configuration has been updated.",
      });
      await queryClient.invalidateQueries({ queryKey: ["programme-settings"] });
    } catch (cause) {
      onError(
        cause instanceof ApiError
          ? cause.message
          : "We could not save programme settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirmCoverage() {
    setReviewBusy(true);
    try {
      await confirmProgrammeDirectoryReview();
      setCoverageAcknowledged(false);
      await queryClient.invalidateQueries({ queryKey: ["programme-settings"] });
      pushToast({ kind: "success", title: "Pilot coverage confirmed", message: "Your review is recorded. Directory changes will require a new review." });
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : "We could not record the pilot coverage review.");
    } finally {
      setReviewBusy(false);
    }
  }
  function discard() {
    setName(null);
    setShortName(null);
    setDescription(null);
    setAcademicYear(null);
    setOwnerId(null);
    setTrainingRequired(null);
    setSaved(false);
  }

  function selectTab(nextTab: SetupTab) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (nextTab === "identity") next.delete("section");
      else next.set("section", nextTab);
      return next;
    });
  }

  function reviewCurrentSection() {
    window.setTimeout(() => {
      const target =
        tab === "access"
          ? document.getElementById("access-policy-summary")
          : tab === "directory"
            ? document.querySelector<HTMLElement>(".programme-directory-page")
            : document.querySelector<HTMLElement>(
                ".programme-setup-progress-card",
              );
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function openSetupItem(target: string) {
    if (target !== "coverage") {
      selectTab(target as SetupTab);
      return;
    }
    if (!directoryComplete) {
      selectTab("directory");
      return;
    }
    window.setTimeout(() => {
      const section = document.getElementById("pilot-coverage-review");
      section?.scrollIntoView({ behavior: "smooth", block: "center" });
      (section?.querySelector<HTMLElement>("input, button") ?? section)?.focus();
    }, 0);
  }

  const statusTitle =
    tab === "access"
      ? policies.isPending
        ? "Loading access policy"
        : policies.isError
          ? "Access policy unavailable"
          : "Review access policy"
      : checksLoading
        ? "Checking setup"
        : checksError
          ? "Setup status unavailable"
          : tab === "directory"
            ? "Build your programme directory"
            : completed === 3
              ? "Pilot coverage reviewed"
              : "Setup in progress";
  const statusText =
    tab === "access"
      ? policies.isPending
        ? "Loading the role permissions managed by the system."
        : policies.isError
          ? "We could not load the system-managed role permissions. Retry this section."
          : "Review the role permissions enforced by the system."
      : checksLoading
        ? "Checking identity and active directory records."
        : checksError
          ? "Some setup checks could not be loaded. Retry the affected section."
          : tab === "directory"
            ? "Add the institutions, facilities and wards used in placements."
            : completed === 3
              ? `Confirmed by ${data.directory_reviewed_by_name || "a Programme Administrator"}. Directory changes reset this review.`
              : `${completed} of 3 setup checks complete. Record presence alone does not confirm pilot coverage.`;
  const statusDone =
    !(checksLoading || checksError) &&
    ((tab === "access" && Boolean(policies.data?.length)) || completed === 3);
  const statusIcon =
    checksLoading || checksError ? (
      <Circle />
    ) : statusDone ? (
      <Check />
    ) : tab === "directory" ? (
      <Building2 />
    ) : (
      <Circle />
    );
  const setupTabs: Array<{ id: SetupTab; label: string; icon: React.ReactNode }> = [
    { id: "identity", label: "Identity", icon: <SlidersHorizontal /> },
    { id: "directory", label: "Directory", icon: <Building2 /> },
    { id: "access", label: "Access policy", icon: <ShieldCheck /> },
  ];

  return (
    <AdminPage className="programme-setup-page">
      <section aria-label="Programme settings" className="contents">
        <AdminPageHeader
          eyebrow="Programme configuration"
          title="Programme setup"
          description="Keep the identity, operating context, and access rules behind your placement programme in order."
        />
        <nav aria-label="Programme setup sections" className="pa-tabs">
          {setupTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={tab === item.id ? "page" : undefined}
              className="pa-tab"
              onClick={() => selectTab(item.id)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        {tab !== "identity" && (
          <div className="ps-status">
            <IconTile
              tone={statusDone ? "green" : "teal"}
              size="sm"
              icon={statusIcon}
            />
            <div className="ps-status__body">
              <p className="ps-status__title">{statusTitle}</p>
              <p className="ps-status__text">{statusText}</p>
            </div>
            <AdminButton
              variant="secondary"
              size="sm"
              icon={<ArrowRight />}
              onClick={reviewCurrentSection}
            >
              {tab === "access"
                ? "Review summary"
                : "View guidance"}
            </AdminButton>
          </div>
        )}
        <div className={`ps-layout ps-layout--${tab === "identity" ? "split" : "wide"}`}>
          <div className="ps-stack">
            {tab === "directory" ? (
              <ProgrammeDirectory onError={onError} />
            ) : tab === "access" ? (
              <AccessPolicyPanel onError={onError} />
            ) : (
              <form
                onSubmit={submit}
                aria-labelledby="identity-heading"
                className="ps-form programme-setup-form"
              >
                <AdminCard
                  titleId="identity-heading"
                  title={
                    <>
                      <span className="ps-step" aria-hidden="true">1</span>
                      Programme identity
                    </>
                  }
                  description="Set the programme name and key details."
                >
                  <div className="ps-fields">
                    <SettingField
                      label="Programme name"
                      required
                      value={currentName}
                      onChange={setName}
                      hint="Use a clear name your team recognizes."
                    />
                    <SettingField
                      label="Short name"
                      value={currentShortName}
                      onChange={setShortName}
                      hint="Used in emails and navigation (e.g. E2E)."
                    />
                    <SettingField
                      label="Description"
                      value={currentDescription}
                      onChange={setDescription}
                      hint="A brief description of the programme’s purpose."
                      multiline
                    />
                    <Field label="Academic year" optional className="ps-field">
                      <SelectInput value={currentAcademicYear} onChange={(event) => setAcademicYear(event.target.value)}>
                        <option value="">Select academic year</option>
                        {years.map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label="Programme owner" required hint="Primary administrator for this programme." className="ps-field">
                      <SelectInput value={currentOwnerId} required onChange={(event) => setOwnerId(event.target.value)}>
                        {(data.owners ?? []).map((owner) => (
                          <option key={owner.id} value={owner.id}>
                            {owner.name}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                  </div>
                </AdminCard>
                <AdminCard
                  title={
                    <>
                      <span className="ps-step" aria-hidden="true">2</span>
                      Placement requirements
                    </>
                  }
                  description="Define whether mentor training is required before placement release."
                >
                  <div className="ps-stack">
                    <label className="ps-toggle-row">
                      <input
                        type="checkbox"
                        checked={currentTrainingRequired}
                        onChange={(event) => {
                          setTrainingRequired(event.target.checked);
                          setSaved(false);
                        }}
                      />
                      <span className="ps-toggle" aria-hidden="true" />
                      <span>
                        <span className="ps-toggle-title">
                          Require mentor training before placement release
                        </span>
                        <span className="ps-hint">
                          When enabled, a mentor must complete all published
                          required training modules.
                        </span>
                      </span>
                    </label>
                    <Notice icon={<Info />}>
                      This applies when a placement is released to student
                      matching, including placements created before this
                      setting changed.
                    </Notice>
                  </div>
                </AdminCard>
              </form>
            )}
          </div>
          {tab === "identity" && (
            <aside className="ps-stack" aria-label="Programme setup progress">
              <AdminCard
                className="programme-setup-progress-card"
                title="Setup progress"
              >
                <div className="ps-progress">
                  <span
                    className="ps-ring"
                    style={
                      {
                        "--progress": `${((completed ?? 0) / 3) * 100}%`,
                      } as React.CSSProperties
                    }
                  >
                    <strong>
                      {completed === null ? "—/3" : `${completed}/3`}
                    </strong>
                  </span>
                  <div>
                    <p className="ps-subtitle">
                      {checksLoading
                        ? "Checking setup data"
                        : checksError
                          ? "Some checks are unavailable"
                          : completed === 3
                            ? "Pilot coverage reviewed"
                            : "Complete the core setup"}
                    </p>
                    <p className="ps-hint">
                      A Programme Administrator confirms that the active
                      directory covers the pilot. Any directory change resets
                      that review.
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  {[
                    ["Programme identity", complete[0], "identity"],
                    ["Directory", complete[1], "directory"],
                    ["Pilot coverage review", complete[2], "coverage"],
                  ].map(([label, done, target]) => (
                    <button
                      key={String(label)}
                      type="button"
                      onClick={() => openSetupItem(String(target))}
                      className="ps-check-row"
                    >
                      <span className={done ? "" : "is-todo"}>
                        {done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                      </span>
                      <span>{label}</span>
                      <ArrowRight size={15} className="pa-row__chevron" />
                    </button>
                  ))}
                </div>
                {directoryComplete && !data.directory_reviewed_at && (
                  <div id="pilot-coverage-review" tabIndex={-1} className="ps-callout">
                    <label>
                      <input
                        type="checkbox"
                        checked={coverageAcknowledged}
                        onChange={(event) => setCoverageAcknowledged(event.target.checked)}
                        className="mt-1 size-4 accent-teal"
                      />
                      <span>I have reviewed the active institutions, facilities, and wards and confirm they cover this pilot.</span>
                    </label>
                    <AdminButton
                      className="mt-3 w-full"
                      size="sm"
                      disabled={!coverageAcknowledged || reviewBusy}
                      onClick={() => void confirmCoverage()}
                    >
                      {reviewBusy ? "Recording review…" : "Confirm pilot coverage"}
                    </AdminButton>
                  </div>
                )}
                {data.directory_reviewed_at && (
                  <p id="pilot-coverage-review" tabIndex={-1} className="ps-callout">
                    Reviewed by {data.directory_reviewed_by_name || "a Programme Administrator"}. A directory change will clear this confirmation.
                  </p>
                )}
                {data.directory_reviewed_at && (
                  <div className="mt-4 border-t border-[#e6edf2] pt-4">
                    <h4 className="ps-subtitle">Invite operational leads</h4>
                    <p className="ps-hint">
                      Choose the role first. The invitation will require an active institution for a Coordinator or an active facility for a Nurse Manager.
                    </p>
                    <div className="ps-actions-col ps-actions-col--stack">
                      <AdminButton variant="secondary" size="sm" onClick={() => onInviteRole("coordinator")}>Invite Coordinator</AdminButton>
                      <AdminButton variant="secondary" size="sm" onClick={() => onInviteRole("nurse_manager")}>Invite Nurse Manager</AdminButton>
                    </div>
                  </div>
                )}
              </AdminCard>
              <AdminCard
                title={
                  <>
                    <IconTile tone="teal" size="sm" icon={<SlidersHorizontal />} />
                    About programme setup
                  </>
                }
              >
                <p className="ps-copy">
                  These settings control how your programme operates. Changes
                  here apply across the entire programme.
                </p>
                <div className="ps-actions-col">
                  <AdminButton
                    variant="ghost"
                    size="sm"
                    icon={<ArrowRight />}
                    onClick={() => selectTab("access")}
                  >
                    Learn more
                  </AdminButton>
                </div>
              </AdminCard>
              <AdminCard
                title={
                  <>
                    <IconTile tone="violet" size="sm" icon={<HelpCircle />} />
                    Need help?
                  </>
                }
              >
                <p className="ps-copy">
                  Visit the help centre or contact support if you’re unsure
                  about any setting.
                </p>
                <div className="ps-actions-col">
                  <a
                    className="pa-btn pa-btn--secondary pa-btn--sm"
                    href={`mailto:${supportEmail}?subject=Programme setup help`}
                  >
                    Open help centre
                  </a>
                  <a
                    className="pa-btn pa-btn--secondary pa-btn--sm"
                    href={`mailto:${supportEmail}?subject=Programme setup support`}
                  >
                    Contact support
                  </a>
                </div>
              </AdminCard>
            </aside>
          )}
        </div>
        {tab === "identity" && (
          <div className="ps-save-bar">
            <p>Changes are saved to the programme record.</p>
            <div>
              <AdminButton variant="secondary" onClick={discard} disabled={busy}>
                Discard changes
              </AdminButton>
              <AdminButton
                icon={<Save />}
                onClick={() =>
                  void document
                    .querySelector<HTMLFormElement>(".programme-setup-form")
                    ?.requestSubmit()
                }
                disabled={busy}
              >
                {saved ? "Saved" : "Save changes"}
              </AdminButton>
            </div>
          </div>
        )}
        {busy && <LoadingOverlay label="Saving programme settings…" />}
      </section>
    </AdminPage>
  );
}

function SettingField({
  label,
  value,
  onChange,
  hint,
  required = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint: string;
  required?: boolean;
  multiline?: boolean;
}) {
  return (
    <Field label={label} required={required} optional={!required} hint={hint} className={multiline ? "ps-field ps-field--wide" : "ps-field"}>
      {multiline ? (
        <TextArea value={value} onChange={(event) => onChange(event.target.value)} required={required} maxLength={2000} />
      ) : (
        <TextInput
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          maxLength={label === "Short name" ? 40 : 120}
        />
      )}
    </Field>
  );
}

function SetupSkeleton() {
  return (
    <AdminPage>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-12 w-72" />
      <div className="ps-layout">
        <AdminCard title="Loading">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="mt-4 h-11 w-full" />
          <Skeleton className="mt-4 h-24 w-full" />
        </AdminCard>
        <AdminCard title="Loading">
          <Skeleton className="h-24 w-full" />
        </AdminCard>
      </div>
    </AdminPage>
  );
}
