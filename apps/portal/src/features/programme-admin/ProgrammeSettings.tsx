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
import { Button, Card, LoadingOverlay, Skeleton } from "@mentormama/ui";
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
      <Card padding="lg">
        <p className="font-body text-sm text-error">
          We could not load programme settings.
        </p>
        <Button
          className="mt-5"
          size="sm"
          onClick={() => void settings.refetch()}
        >
          Try again
        </Button>
      </Card>
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

  return (
    <section aria-label="Programme settings" className="programme-setup-page">
      <div className="programme-setup-heading">
        <div>
          <p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal">
            Programme configuration
          </p>
          <h2 className="mt-3 font-display text-4xl font-bold tracking-tight text-navy sm:text-5xl">
            Programme setup
          </h2>
          <p className="mt-3 max-w-3xl font-body text-base leading-7 text-navy-muted">
            Keep the identity, operating context, and access rules behind your
            placement programme in order.
          </p>
        </div>
        {tab !== "identity" && <div
          className={`programme-setup-ready ${completed === 3 ? "programme-setup-ready--complete" : ""}`}
        >
          <span className="programme-setup-ready-icon">
            {checksLoading || checksError ? (
              <Circle size={18} />
            ) : (tab === "access" && Boolean(policies.data?.length)) ||
              completed === 3 ? (
              <Check size={18} />
            ) : tab === "directory" ? (
              <Building2 size={18} />
            ) : (
              <Circle size={18} />
            )}
          </span>
          <div>
            <p className="font-body text-sm font-bold text-navy">
              {tab === "access"
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
                        : "Setup in progress"}
            </p>
            <p className="mt-1 font-body text-xs text-navy-muted">
              {tab === "access"
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
                        : `${completed} of 3 setup checks complete. Record presence alone does not confirm pilot coverage.`}
            </p>
          </div>
          <button
            type="button"
            onClick={reviewCurrentSection}
            className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-white px-4 font-body text-xs font-semibold text-navy hover:border-teal hover:text-teal"
          >
            {tab === "access"
              ? "Review summary"
              : tab === "directory"
                ? "View guidance"
                : "View checklist"}{" "}
            <ArrowRight size={15} />
          </button>
        </div>}
      </div>
      <div className={`programme-setup-layout programme-setup-layout--${tab}`}>
        <div className="min-w-0">
          <nav
            aria-label="Programme setup sections"
            className="programme-setup-tabs"
          >
            <div className="flex min-w-max gap-7">
              {[
                [
                  "identity",
                  "Identity",
                  <SlidersHorizontal size={17} key="i" />,
                ],
                ["directory", "Directory", <Building2 size={17} key="d" />],
                ["access", "Access policy", <ShieldCheck size={17} key="a" />],
              ].map(([id, label, icon]) => (
                <button
                  key={String(id)}
                  type="button"
                  aria-current={tab === id ? "page" : undefined}
                  className={`inline-flex min-h-12 items-center gap-2 border-b-2 px-1 font-body text-sm font-semibold transition ${tab === id ? "border-teal text-navy" : "border-transparent text-navy-muted hover:border-border hover:text-navy"}`}
                  onClick={() => selectTab(id as SetupTab)}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </nav>
          {tab === "directory" ? (
            <ProgrammeDirectory onError={onError} />
          ) : tab === "access" ? (
            <AccessPolicyPanel onError={onError} />
          ) : (
            <form
              onSubmit={submit}
              aria-labelledby="identity-heading"
              className="programme-setup-form"
            >
              <div className="programme-setup-card">
                <div className="programme-setup-section-title">
                  <span className="programme-setup-step">1</span>
                  <div>
                    <h3
                      id="identity-heading"
                      className="font-display text-xl font-bold text-navy"
                    >
                      Programme identity
                    </h3>
                    <p className="mt-1 font-body text-sm text-navy-muted">
                      Set the programme name and key details.
                    </p>
                  </div>
                </div>
                <div className="programme-setup-fields">
                  <Field
                    label="Programme name"
                    required
                    value={currentName}
                    onChange={setName}
                    hint="Use a clear name your team recognizes."
                  />
                  <Field
                    label="Short name"
                    value={currentShortName}
                    onChange={setShortName}
                    hint="Used in emails and navigation (e.g. E2E)."
                  />
                  <Field
                    label="Description"
                    value={currentDescription}
                    onChange={setDescription}
                    hint="A brief description of the programme’s purpose."
                    multiline
                  />
                  <label className="programme-setup-field">
                    <span className="font-body text-sm font-semibold text-navy">
                      Academic year <em>(optional)</em>
                    </span>
                    <select
                      value={currentAcademicYear}
                      onChange={(event) => setAcademicYear(event.target.value)}
                      className="auth-control mt-2"
                    >
                      <option value="">Select academic year</option>
                      {years.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="programme-setup-field">
                    <span className="font-body text-sm font-semibold text-navy">
                      Programme owner <em>(required)</em>
                    </span>
                    <select
                      value={currentOwnerId}
                      required
                      onChange={(event) => setOwnerId(event.target.value)}
                      className="auth-control mt-2"
                    >
                      {(data.owners ?? []).map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {owner.name}
                        </option>
                      ))}
                    </select>
                    <span className="mt-2 block font-body text-xs leading-5 text-navy-muted">
                      Primary administrator for this programme.
                    </span>
                  </label>
                </div>
              </div>
              <div className="programme-setup-card programme-setup-card--requirements">
                <div className="programme-setup-section-title">
                  <span className="programme-setup-step">2</span>
                  <div>
                    <h3 className="font-display text-xl font-bold text-navy">
                      Placement requirements
                    </h3>
                    <p className="mt-1 font-body text-sm text-navy-muted">
                      Define whether mentor training is required before
                      placement release.
                    </p>
                  </div>
                </div>
                <label className="programme-setup-toggle-row">
                  <input
                    type="checkbox"
                    checked={currentTrainingRequired}
                    onChange={(event) => {
                      setTrainingRequired(event.target.checked);
                      setSaved(false);
                    }}
                  />
                  <span className="programme-setup-toggle" aria-hidden="true" />
                  <span>
                    <span className="block font-body text-sm font-semibold text-navy">
                      Require mentor training before placement release
                    </span>
                    <span className="mt-1 block font-body text-xs leading-5 text-navy-muted">
                      When enabled, a mentor must complete all published
                      required training modules.
                    </span>
                  </span>
                </label>
                <p className="programme-setup-info">
                  <Info size={17} />
                  This applies when a placement is released to student matching,
                  including placements created before this setting changed.
                </p>
              </div>
            </form>
          )}
        </div>
        {tab === "identity" && (
          <aside
            className="programme-setup-sidebar"
            aria-label="Programme setup progress"
          >
            <Card padding="lg" className="programme-setup-progress-card">
              <h3 className="font-display text-lg font-bold text-navy">
                Setup progress
              </h3>
              <div className="mt-5 flex items-center gap-4">
                <span
                  className="programme-setup-progress-ring"
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
                  <p className="font-body text-sm font-bold text-navy">
                    {checksLoading
                      ? "Checking setup data"
                      : checksError
                        ? "Some checks are unavailable"
                        : completed === 3
                          ? "Pilot coverage reviewed"
                          : "Complete the core setup"}
                  </p>
                  <p className="mt-1 font-body text-xs leading-5 text-navy-muted">
                    A Programme Administrator confirms that the active directory covers the pilot. Any directory change resets that review.
                  </p>
                </div>
              </div>
              <div className="mt-5 divide-y divide-border border-t border-border">
                {[
                  ["Programme identity", complete[0], "identity"],
                  ["Directory", complete[1], "directory"],
                  ["Pilot coverage review", complete[2], "coverage"],
                ].map(([label, done, target]) => (
                  <button
                    key={String(label)}
                    type="button"
                    onClick={() => openSetupItem(String(target))}
                    className="flex w-full items-center gap-3 py-3 text-left"
                  >
                    <span className={done ? "text-teal" : "text-navy-muted/60"}>
                      {done ? <CheckCircle2 size={19} /> : <Circle size={19} />}
                    </span>
                    <span className="flex-1 font-body text-sm font-semibold text-navy">
                      {label}
                    </span>
                    <ArrowRight size={15} className="text-navy-muted" />
                  </button>
                ))}
              </div>
              {directoryComplete && !data.directory_reviewed_at && (
                <div id="pilot-coverage-review" tabIndex={-1} className="mt-5 rounded-2xl border border-teal/20 bg-teal-light/40 p-4 focus:outline-none focus:ring-2 focus:ring-teal/30">
                  <label className="flex items-start gap-3 font-body text-sm leading-6 text-navy">
                    <input
                      type="checkbox"
                      checked={coverageAcknowledged}
                      onChange={(event) => setCoverageAcknowledged(event.target.checked)}
                      className="mt-1 size-4 accent-teal"
                    />
                    <span>I have reviewed the active institutions, facilities, and wards and confirm they cover this pilot.</span>
                  </label>
                  <Button
                    type="button"
                    className="mt-4 w-full"
                    size="sm"
                    disabled={!coverageAcknowledged || reviewBusy}
                    onClick={() => void confirmCoverage()}
                  >
                    {reviewBusy ? "Recording review…" : "Confirm pilot coverage"}
                  </Button>
                </div>
              )}
              {data.directory_reviewed_at && (
                <p id="pilot-coverage-review" tabIndex={-1} className="mt-4 rounded-xl bg-teal-light/40 p-3 font-body text-xs leading-5 text-navy-muted focus:outline-none focus:ring-2 focus:ring-teal/30">
                  Reviewed by {data.directory_reviewed_by_name || "a Programme Administrator"}. A directory change will clear this confirmation.
                </p>
              )}
              {data.directory_reviewed_at && (
                <div className="mt-5 border-t border-border pt-5">
                  <h4 className="font-body text-sm font-bold text-navy">Invite operational leads</h4>
                  <p className="mt-1 font-body text-xs leading-5 text-navy-muted">
                    Choose the role first. The invitation will require an active institution for a Coordinator or an active facility for a Nurse Manager.
                  </p>
                  <div className="mt-3 grid gap-2">
                    <Button type="button" size="sm" variant="tertiary" onClick={() => onInviteRole("coordinator")}>Invite Coordinator</Button>
                    <Button type="button" size="sm" variant="tertiary" onClick={() => onInviteRole("nurse_manager")}>Invite Nurse Manager</Button>
                  </div>
                </div>
              )}
            </Card>
            <Card padding="lg" className="programme-setup-help-card">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-light text-teal">
                  <SlidersHorizontal size={19} />
                </span>
                <div>
                  <h3 className="font-display text-lg font-bold text-navy">
                    About programme setup
                  </h3>
                  <p className="mt-2 font-body text-sm leading-6 text-navy-muted">
                    These settings control how your programme operates. Changes
                    here apply across the entire programme.
                  </p>
                  <button
                    type="button"
                    onClick={() => selectTab("access")}
                    className="mt-5 inline-flex items-center gap-2 font-body text-sm font-bold text-teal"
                  >
                    Learn more <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            </Card>
            <Card padding="lg" className="programme-setup-help-card">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lilac text-navy">
                  <HelpCircle size={19} />
                </span>
                <div>
                  <h3 className="font-display text-lg font-bold text-navy">
                    Need help?
                  </h3>
                  <p className="mt-2 font-body text-sm leading-6 text-navy-muted">
                    Visit the help centre or contact support if you’re unsure
                    about any setting.
                  </p>
                  <div className="mt-5 flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                    <Button
                      type="button"
                      size="sm"
                      variant="tertiary"
                      to="mailto:support@mentormama.org?subject=Programme setup help"
                    >
                      Open help centre
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="tertiary"
                      to="mailto:support@mentormama.org?subject=Programme setup support"
                    >
                      Contact support
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </aside>
        )}
      </div>
      {tab === "identity" && (
        <div className="programme-setup-actions">
          <p className="font-body text-xs text-navy-muted">
            Changes are saved to the programme record.
          </p>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="tertiary"
              onClick={discard}
              disabled={busy}
            >
              Discard changes
            </Button>
            <Button
              type="button"
              onClick={() =>
                void document
                  .querySelector<HTMLFormElement>(".programme-setup-form")
                  ?.requestSubmit()
              }
              disabled={busy}
            >
              <Save size={16} className="mr-2" />
              {saved ? "Saved" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
      {busy && <LoadingOverlay label="Saving programme settings…" />}
    </section>
  );
}

function Field({
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
    <label
      className={`programme-setup-field ${multiline ? "programme-setup-field--wide" : ""}`}
    >
      <span className="font-body text-sm font-semibold text-navy">
        {label}{" "}
        {required ? <span className="text-error">*</span> : <em>(optional)</em>}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          maxLength={2000}
          className="auth-control mt-2 min-h-24 resize-y py-3"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          maxLength={label === "Short name" ? 40 : 120}
          className="auth-control mt-2"
        />
      )}
      <span className="mt-2 block font-body text-xs leading-5 text-navy-muted">
        {hint}
      </span>
    </label>
  );
}
function SetupSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-12 w-72" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Card padding="lg">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-6 h-11 w-full" />
          <Skeleton className="mt-4 h-11 w-full" />
          <Skeleton className="mt-4 h-24 w-full" />
        </Card>
        <Card padding="lg">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-6 h-24 w-full" />
        </Card>
      </div>
    </div>
  );
}
