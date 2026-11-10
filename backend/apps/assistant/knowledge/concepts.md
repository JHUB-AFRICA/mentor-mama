# MentorMAMA concepts and rules in plain language

## What is a placement?

A placement is one student's period of clinical practice at one facility and ward, with one mentor, between a start date and an end date. It belongs to a cohort at the student's institution. A placement always has exactly one student, one ward and one active mentor at a time. It moves through a fixed set of stages (see the placement states below), and nothing can skip a stage.
<!-- source: docs/product/requirements.md, docs/architecture/stage3-business-rules-and-invariants.md -->

## What are the placement states and what does each one mean?

Ten states: Draft, Scheduled, Awaiting student, Orientation, Induction, Active, Paused, Completed, Archived and Withdrawn. The usual path is Draft, Scheduled, Awaiting student, Orientation, Induction, Active, Completed, Archived. Paused and Withdrawn are side exits. Each state is explained in the next sections. Completed and Archived/Withdrawn placements cannot be changed except as described there.
<!-- source: backend/apps/placements/state_machine.py, docs/architecture/stage3-business-rules-and-invariants.md -->

## What do Draft and Scheduled mean?

Draft: the coordinator is still putting the placement together; the student and mentor cannot see it. Scheduled: a student, a ward and a mentor are all assigned and the dates are valid, but the student has not been told yet. A placement moves from Draft to Scheduled by itself once all three are assigned, whoever completes the set (the coordinator creates the placement; the nurse manager assigns the ward and mentor). The coordinator then releases it.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md, backend/apps/placements/services.py -->

## What does Awaiting student mean?

The placement has been released to the student and is waiting for them to review and sign their placement acknowledgement. When the student signs, the placement moves to Orientation automatically. A coordinator or programme administrator releases the placement (Scheduled to Awaiting student). If the programme requires mentor training first, the release is blocked until the mentor has finished all required training.
<!-- source: backend/apps/placements/services.py, docs/architecture/stage3-business-rules-and-invariants.md -->

## What do Orientation and Induction mean, and how are they different?

Orientation is the student's step: they read the orientation guide and acknowledge it. Induction is the mentor's step: when the student has arrived and acknowledged orientation, the mentor works through the induction checklist with them and signs it. Signing the induction makes the placement Active. A student cannot do induction for themselves, and a mentor cannot acknowledge orientation for a student.
<!-- source: docs/product/requirements.md, apps/portal/src/features/induction/OrientationPanel.tsx, backend/apps/placements/services.py -->

## What does Active mean?

Active is normal mentorship. While a placement is Active, the mentor can log mentorship sessions, the student can share feedback and raise concerns, and the student can later submit the final assessment. Mentors can only log sessions on Active placements.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md, apps/portal/src/features/mentor/MentorLog.tsx -->

## What does Paused mean and who can pause or resume?

Paused means the placement is temporarily on hold, for a recorded reason such as illness, industrial action or facility closure. A nurse manager, coordinator or programme administrator can pause an Active placement and resume it. While paused, no sessions can be logged. When it resumes, the actual end date is extended by the paused days so the student keeps their full time. The original planned dates are never changed.
<!-- source: backend/apps/placements/services.py, docs/architecture/stage3-business-rules-and-invariants.md -->

## What do Completed, Archived and Withdrawn mean?

Completed: the placement is finished, the final assessment has been submitted and no safeguarding concern is still open. A nurse manager (or a programme administrator) completes it. Archived: a completed placement kept as a read-only record; only a programme administrator archives it. Withdrawn: the placement ended early, with a recorded reason; a coordinator, nurse manager or programme administrator can withdraw it. Archived and Withdrawn placements can no longer be changed.
<!-- source: backend/apps/placements/state_machine.py, backend/apps/placements/services.py, backend/apps/identity/capabilities.py -->

## Who moves a placement from one state to the next?

- Draft to Scheduled: automatic, when student, ward and mentor are assigned.
- Scheduled to Awaiting student: coordinator or programme administrator ("Release placement").
- Awaiting student to Orientation: automatic, when the student signs.
- Orientation to Induction: the assigned mentor or a nurse manager.
- Induction to Active: automatic, when the mentor signs the completed induction.
- Active to Paused and back: nurse manager, coordinator or programme administrator.
- Active to Completed: nurse manager or programme administrator.
- Completed to Archived: programme administrator.

<!-- source: backend/apps/placements/services.py, backend/apps/identity/capabilities.py -->

## What are institutions, facilities, wards and cohorts?

An institution is a university or college whose students take part. A facility is a hospital or health unit that hosts placements. A ward is a unit inside a facility. A cohort is a group of students at one institution with a start and end date. The programme administrator maintains institutions, facilities and wards in Programme setup; coordinators manage cohorts.
<!-- source: docs/product/requirements.md, backend/apps/institutions/services.py, apps/portal/src/features/programme-admin/ProgrammeDirectory.tsx -->

## How does ward capacity work?

Every ward has a maximum number of students. Placements that are in Orientation, Induction, Active or Paused count towards it. A ward that is full cannot take another placement, and capacity cannot be lowered below the number of students already there. A cohort's planned capacity is different: it is only a planning target, and going over it shows a warning but does not block anything.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md, backend/apps/core/errors.py -->

## Can a student be in two cohorts or two placements at once?

No. A student cannot belong to two active cohorts whose dates overlap, and cannot have two overlapping placements. The system rejects the second one and tells you the student already has an overlapping cohort or placement.
<!-- source: backend/apps/core/errors.py, docs/verification/coordinator-verification-2026-11-09.md -->

## What are mentorship sessions and which types are there?

A mentorship session is a short record of a learning conversation between a mentor and a student on an Active placement. Types: Orientation, Debrief, Bedside teaching, Skills discussion, Feedback, Case reflection, Case review, Placement planning, Wellbeing support, Career development and Other. A session needs a date, a type, at least one topic and a note of what was covered. It must never contain patient details.
<!-- source: apps/portal/src/features/mentorship/SessionLogForm.tsx, backend/apps/mentorship/models.py -->

## When is the final assessment available?

The final assessment is a student close-out form. It becomes available only when the placement is Active (or Paused) and the placement's end date has been reached. Before that you will see that it is not available yet. It can be submitted once. It asks for an endline confidence score (0 to 100) and an overall experience rating (1 to 5). Completion of the placement needs it.
<!-- source: backend/apps/core/errors.py, apps/portal/src/features/assessments/FinalAssessmentForm.tsx, docs/architecture/stage3-business-rules-and-invariants.md -->

## What are mentor training modules and quizzes?

Training modules are short courses for clinical mentors, made of lessons and usually a knowledge check (a multiple-choice quiz). Programme administrators write and publish them. Only mentors complete them. A passing attempt marks the module complete; a failed attempt is recorded and you may try again after reviewing the lessons.
<!-- source: backend/apps/learning/services.py, apps/portal/src/features/training/TrainingWorkspace.tsx -->

## What is the pass mark for a training quiz?

Each module has its own pass mark, shown on the module page. It is set between 1 and 100 percent, and 70 percent is the default when authors do not choose another. Your score is the share of questions answered correctly. A score at or above the pass mark completes the module.
<!-- source: backend/apps/learning/serializers.py, apps/portal/src/features/training/TrainingWorkspace.tsx -->

## What are required training modules and the training gate?

Programme administrators can mark modules as Required. By default the programme asks that a mentor finishes all required, published modules before a placement assigned to them is released to the student. If they have not, the coordinator's release is blocked with a message that the assigned mentor has not completed required training. This is a programme-level setting that can be switched off.
<!-- source: backend/apps/placements/services.py, backend/apps/identity/models.py, docs/architecture/stage3-business-rules-and-invariants.md -->

## What kinds of content are in the library?

The library holds Guides, Documents (PDF, Word or PowerPoint files) and External resources (links). Training modules also appear there. Categories include General, Onboarding, Clinical care, Safeguarding, Templates and Reference. You only see items that are published and shared with your role.
<!-- source: backend/apps/content/models.py, backend/apps/content/serializers.py, backend/apps/content/views.py -->

## What notifications does MentorMAMA send?

You get an in-app inbox (the bell icon) and, for some events, plain-text email. Examples: a placement is ready for you to review, a mentor was assigned, a placement was paused, resumed, completed or withdrawn, a safeguarding concern needs review, and account or security notices. Notifications never contain safeguarding details or session notes. Account and security emails cannot be switched off.
<!-- source: apps/portal/src/features/notifications/NotificationPopover.tsx, backend/apps/notifications/models.py, docs/product/requirements.md -->

## What reports and exports are available?

Nurse managers, coordinators and programme administrators have a Reports screen with counts and trends for their own scope (facility, institution or programme). They can request an export of placement records as CSV, Excel, JSON or PDF. Exports hold counts and flags, never session notes, feedback text or safeguarding text. Download links last 15 minutes.
<!-- source: backend/apps/analytics/export_service.py, apps/portal/src/features/coordinator/CoordinatorReports.tsx, apps/portal/src/features/programme-admin/Reports.tsx -->

## What does "scope" mean in MentorMAMA?

Scope is the part of the programme you are allowed to see. Programme administrators see the whole programme. Coordinators and students are tied to an institution. Nurse managers and mentors are tied to a facility. If you open something outside your scope you see "Not found", which does not reveal whether it exists.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md, backend/apps/core/errors.py -->
