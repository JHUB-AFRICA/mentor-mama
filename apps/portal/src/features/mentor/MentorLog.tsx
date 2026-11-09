import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardPenLine,
  Search,
  UserRound,
  WifiOff,
  X,
} from "lucide-react";
import { Container } from "@mentormama/ui";

import { useToast } from "../../components/ToastProvider";
import type { CurrentUser, Placement } from "../../services/api";
import { SessionLogForm } from "../mentorship/SessionLogForm";
import { OfflineSessionQueue } from "../mentorship/OfflineSessionQueue";
import { MentorWorkspaceFrame } from "./MentorWorkspaceFrame";

import "./MentorLog.css";

type Outcome = { status: "queued" | "synced"; createdCount?: number; duplicateCount?: number };

const pageSize = 5;
const maxBatchSize = 100;

export function MentorLog({
  user,
  placements,
  onError,
}: {
  user: CurrentUser;
  placements: Placement[];
  onError: (message: string) => void;
}) {
  const [params] = useSearchParams();
  const { pushToast } = useToast();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine);

  const requestedPlacement = params.get("placement");

  /*
   * Resolve placement from URL.
   * This makes links such as:
   * /mentor?view=log&placement=123
   * open the correct student automatically.
   */
  useEffect(() => {
    if (!requestedPlacement || selectedIds.length) {
      return;
    }

    const match = placements.find(
      (placement) => placement.id === requestedPlacement,
    );

    if (match) {
      if (match.state === "active") setSelectedIds([match.id]);
    }
  }, [placements, requestedPlacement, selectedIds]);

  /*
   * Keep pagination valid when filtering.
   */
  const eligible = useMemo(
    () => placements.filter((placement) => placement.state === "active" && (placement.actual_end ?? placement.planned_end) >= new Date().toISOString().slice(0, 10)),
    [placements],
  );
  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => eligible.some((placement) => placement.id === id)));
  }, [eligible]);
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return eligible;
    }

    return eligible.filter((placement) => {
      const searchable = [
        placement.student?.name ?? "",
        placement.student?.registration_number ?? "",
        placement.ward?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalized);
    });
  }, [eligible, query]);

  const selectedPlacements = selectedIds
    .map((id) => placements.find((placement) => placement.id === id))
    .filter((placement): placement is Placement => Boolean(placement));
  const selected = selectedPlacements[0] ?? null;
  const selectablePlacements = eligible.slice(0, maxBatchSize);
  const allEligibleSelected = selectablePlacements.length > 0 && selectablePlacements.every((placement) => selectedIds.includes(placement.id));

  const totalPages = Math.max(
    1,
    Math.ceil(visible.length / pageSize),
  );

  const pageRows = visible.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  /*
   * Online/offline status.
   */
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
    };

    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  function chooseStudent(placement: Placement) {
    setSelectedIds((current) => current.includes(placement.id)
      ? current.filter((id) => id !== placement.id)
      : [...current, placement.id]);
    setOutcome(null);
  }

  function clearSelection() {
    setSelectedIds([]);
    setOutcome(null);
  }

  function handleOutcome(status: "queued" | "synced", summary?: { createdCount: number; duplicateCount: number }) {
    const outcome = { status, ...summary } as Outcome;
    setOutcome(outcome);

    pushToast(
      status === "queued"
        ? {
            kind: "info",
            title: `Session saved for ${selectedIds.length} students`,
            message: "The full group will sync together when your connection returns.",
          }
        : {
            kind: "success",
            title: `Session logged for ${summary?.createdCount ?? selectedIds.length} students`,
            message: summary?.duplicateCount
              ? `${summary.createdCount} new records saved; ${summary.duplicateCount} existing records were already up to date.`
              : "The mentorship record has been added to each selected student’s history.",
          },
    );
    if (status === "synced") setQueueRefreshKey((value) => value + 1);
  }

  return (
    <MentorWorkspaceFrame
      user={user}
      title="Log a session"
      active="log"
    >
      <Container
        size="wide"
        className="mentor-log-page"
      >
        {/* ---------------------------------------------------------------- */}
        {/* PAGE HEADER                                                      */}
        {/* ---------------------------------------------------------------- */}

        <header className="mentor-log-hero">
          <div className="mentor-log-hero__content">
            <Link
              to="/mentor?view=students"
              className="mentor-log-back"
            >
              <ArrowLeft size={16} />
              Back to students
            </Link>

            <div className="mentor-log-eyebrow">
              <span className="mentor-log-eyebrow__dot" />

              Clinical practice
              <span>/</span>
              Mentorship record
            </div>

            <h1>Log a session.</h1>

            <p>
              Record the conversation, learning moments, and
              follow-up actions from your mentorship session.
            </p>
          </div>

          <ConnectionStatus online={online} />
        </header>

        <OfflineSessionQueue
          actorId={user.id}
          placements={placements}
          refreshToken={queueRefreshKey}
          onChanged={() => setQueueRefreshKey((value) => value + 1)}
        />

        {/* ---------------------------------------------------------------- */}
        {/* WORKFLOW                                                         */}
        {/* ---------------------------------------------------------------- */}

        <div className="mentor-log-workspace">
          {/* -------------------------------------------------------------- */}
          {/* STUDENT SELECTOR                                               */}
          {/* -------------------------------------------------------------- */}

          <aside
            className={`mentor-log-selector ${
              selectedIds.length
                ? "mentor-log-selector--has-selection"
                : ""
            }`}
          >
            <div className="selector-header">
              <div className="step-number">01</div>

              <div>
                <span className="step-kicker">
                  Step one
                </span>

                <h2>Choose attendees</h2>
              </div>
            </div>

            <p className="selector-description">
              Select everyone who attended. Only students whose placement period is still open can be logged.
            </p>

            {eligible.length > 0 && <button
              type="button"
              className="change-student-button"
              onClick={() => setSelectedIds(allEligibleSelected ? [] : selectablePlacements.map((placement) => placement.id))}
            >
              {allEligibleSelected ? "Clear selection" : eligible.length > maxBatchSize
                ? `Select first ${maxBatchSize} of ${eligible.length} active students`
                : `Select all ${eligible.length} active students`}
            </button>}

            {/* SELECTED STUDENT */}
            {selected && (
              <div className="selected-student">
                <div className="selected-student__top">
                  <StudentAvatar
                    name={selected.student?.name}
                    large
                  />

                  <button
                    type="button"
                    onClick={clearSelection}
                    className="clear-selection"
                    aria-label="Change selected student"
                  >
                    <X size={15} />
                  </button>
                </div>

                <strong>{selectedIds.length === 1
                  ? selected?.student?.name ?? "Assigned student"
                  : `${selectedIds.length} students selected`}</strong>
                <span className="selected-student__attendees">
                  {selectedPlacements.map((placement) => placement.student?.name ?? "Assigned student").join(", ")}
                </span>

                <div className="selected-student__ward">
                  <span>{selectedPlacements.length > 1 ? "Wards represented" : "Current ward"}</span>
                  <strong>
                    {[...new Set(selectedPlacements.map((placement) => placement.ward?.name ?? "Ward not listed"))].join(", ")}
                  </strong>
                </div>

                <button
                  type="button"
                  onClick={clearSelection}
                  className="change-student-button"
                >
                  Clear attendees
                </button>
              </div>
            )}

            {/* SEARCH */}
            <div className="student-search">
              <Search size={17} />

              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search students..."
                aria-label="Search students to log a session"
              />

              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setPage(1);
                  }}
                  aria-label="Clear student search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* STUDENT LIST */}
            <div className="student-selector-list">
              {pageRows.length ? (
                pageRows.map((placement) => (
                  <button
                    key={placement.id}
                    type="button"
                    onClick={() =>
                      chooseStudent(placement)
                    }
                    disabled={!selectedIds.includes(placement.id) && selectedIds.length >= maxBatchSize}
                    aria-pressed={selectedIds.includes(placement.id)}
                    aria-label={`${selectedIds.includes(placement.id) ? "Remove" : "Select"} ${placement.student?.name ?? "assigned student"}`}
                    className={`student-selector-row ${
                      selectedIds.includes(placement.id)
                        ? "student-selector-row--selected"
                        : ""
                    }`}
                  >
                    <StudentAvatar
                      name={placement.student?.name}
                    />

                    <span className="student-selector-row__copy">
                      <strong>
                        {placement.student?.name ??
                          "Assigned student"}
                      </strong>

                      <small>
                        {placement.ward?.name ??
                          "Ward not listed"}
                      </small>
                    </span>

                    <span className="student-selector-row__arrow">
                      {selectedIds.includes(placement.id) ? (
                        <CheckCircle2 size={17} />
                      ) : (
                        <ArrowRight size={16} />
                      )}
                    </span>
                  </button>
                ))
              ) : (
                <div className="selector-empty">
                  <UserRound size={19} />

                  <p>
                    {eligible.length
                      ? "No eligible students match your search."
                      : "No active placements can accept session logs yet. Complete induction first."}
                  </p>
                </div>
              )}
            </div>

            {/* PAGINATION */}
            {visible.length > 0 && (
              <div className="selector-footer">
                <span>
                  {visible.length}{" "}
                  {visible.length === 1
                    ? "student"
                    : "students"}
                </span>

                {totalPages > 1 && (
                  <div className="selector-pagination">
                    <button
                      type="button"
                      disabled={page === 1}
                      onClick={() =>
                        setPage((value) => value - 1)
                      }
                      aria-label="Previous students"
                    >
                      <ChevronLeft size={14} />
                    </button>

                    <strong>
                      {page} / {totalPages}
                    </strong>

                    <button
                      type="button"
                      disabled={page === totalPages}
                      onClick={() =>
                        setPage((value) => value + 1)
                      }
                      aria-label="Next students"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </aside>

          {/* -------------------------------------------------------------- */}
          {/* FORM AREA                                                      */}
          {/* -------------------------------------------------------------- */}

          <main
            className={`mentor-log-main ${
              selectedIds.length
                ? "mentor-log-main--selected"
                : ""
            }`}
          >
            {selectedIds.length ? (
              <>
                {/* FORM HEADER */}
                <div className="session-form-header">
                  <div className="session-form-header__identity">
                    <div className="step-number">
                      02
                    </div>

                    <div>
                      <span className="step-kicker">
                        Step two
                      </span>

                      <h2>
                        Record mentorship session
                      </h2>

                      <p>
                        For <strong>{selectedIds.length === 1
                          ? selected?.student?.name ?? "Assigned student"
                          : `${selectedIds.length} selected students`}</strong>
                      </p>
                    </div>
                  </div>

                  {outcome && <OutcomeNotice outcome={outcome} />}
                </div>

                {/* SESSION FORM */}
                <div className="session-form-container">
                  <SessionLogForm
                    key={selected.id}
                    actorId={user.id}
                    placementId={selected.id}
                    placementIds={selectedIds}
                    draftKey={`batch:${[...selectedIds].sort().join(":")}`}
                    onError={onError}
                    onQueued={() => setQueueRefreshKey((value) => value + 1)}
                    onSaved={(summary) => handleOutcome("synced", summary ?? { createdCount: 1, duplicateCount: 0 })}
                    onOutcome={(status) => { if (status === "queued") handleOutcome(status); }}
                    embedded
                  />
                </div>
              </>
            ) : (
              <SelectionPlaceholder />
            )}
          </main>
        </div>
      </Container>
    </MentorWorkspaceFrame>
  );
}


/* ==========================================================================
   CONNECTION STATUS
   ========================================================================== */

function ConnectionStatus({
  online,
}: {
  online: boolean;
}) {
  return (
    <div
      className={`connection-status ${
        online
          ? "connection-status--online"
          : "connection-status--offline"
      }`}
    >
      <span className="connection-status__icon">
        {online ? (
          <CheckCircle2 size={19} />
        ) : (
          <WifiOff size={19} />
        )}
      </span>

      <span>
        <strong>
          {online
            ? "You’re online"
            : "You’re offline"}
        </strong>

        <small>
          {online
            ? "Sessions sync as soon as you save."
            : "Sessions will sync when your connection returns."}
        </small>
      </span>
    </div>
  );
}


/* ==========================================================================
   STUDENT AVATAR
   ========================================================================== */

function StudentAvatar({
  name,
  large = false,
}: {
  name?: string;
  large?: boolean;
}) {
  const initials = (name ?? "Assigned")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <span
      className={`student-avatar ${
        large ? "student-avatar--large" : ""
      }`}
    >
      {initials}
    </span>
  );
}


/* ==========================================================================
   OUTCOME NOTICE
   ========================================================================== */

function OutcomeNotice({
  outcome,
}: {
  outcome: Outcome;
}) {
  const { status } = outcome;
  return (
    <span
      className={`outcome-notice ${
        status === "queued"
          ? "outcome-notice--queued"
          : "outcome-notice--synced"
      }`}
      role="status"
    >
      {status === "queued" ? (
        <WifiOff size={14} />
      ) : (
        <CheckCircle2 size={14} />
      )}

      {status === "queued"
        ? "Saved offline"
        : `Logged for ${outcome.createdCount ?? 1}${outcome.duplicateCount ? ` · ${outcome.duplicateCount} already recorded` : ""}`}
    </span>
  );
}


/* ==========================================================================
   EMPTY / INITIAL STATE
   ========================================================================== */

function SelectionPlaceholder() {
  return (
    <div className="selection-placeholder">
      <div className="selection-placeholder__illustration">
        <ClipboardPenLine size={25} />
      </div>

      <span className="selection-placeholder__step">
        STEP TWO
      </span>

      <h2>Choose attendees to begin.</h2>

      <p>
        Select active students who attended the same session. Shared details are
        saved once and copied to each selected student’s history.
      </p>

      <div className="selection-placeholder__hint">
        <span>01</span>
        Select a student
        <ArrowRight size={14} />
        <span>02</span>
        Record session
      </div>
    </div>
  );
}
