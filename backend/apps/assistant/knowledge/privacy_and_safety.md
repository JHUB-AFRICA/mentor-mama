# Privacy and safety

## What information does MentorMAMA hold?

MentorMAMA holds account details (name, email, optional phone), role and scope, placement records (dates, facility, ward, mentor, state), induction and orientation records, mentorship session notes, training progress, feedback, safeguarding concerns and an audit trail of actions. Students also add course, year of study and an emergency contact. Passwords are stored hashed.
<!-- source: backend/apps/identity/authentication.py, apps/portal/src/features/student/StudentWorkspace.tsx, docs/architecture/stage3-business-rules-and-invariants.md -->

## What does MentorMAMA NOT hold?

No patient-identifying information. The system has no field for patient names, numbers or records, and every free-text box reminds you not to enter any. Administrators can never see anyone's password, authenticator secret or recovery codes.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md, docs/architecture/authentication-and-account-lifecycle.md -->

## Why must I never type patient details?

Mentorship notes, feedback and concerns are about learning and wellbeing, not about patients. If you include patient details by mistake, remove them. Menta also asks you not to share them and rejects messages that contain email addresses or long numbers.
<!-- source: apps/portal/src/features/mentorship/SessionLogForm.tsx, backend/apps/assistant/service.py -->

## Who can read mentorship session notes?

The student can read their own sessions and the assigned mentor their own entries. Nurse managers can read sessions at their facility. Coordinators see only the date, type, topics and duration, not the written notes.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md -->

## How does confidential feedback work?

Confidential feedback is attached to your placement so authorised staff (your nurse manager and your institution's coordinator) can follow up. Mentors never see individual feedback about themselves, only grouped figures once at least three responses exist, with no breakdown that could identify anyone. Submitted feedback cannot be edited.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md, backend/apps/core/errors.py -->

## What is the current state of anonymous feedback?

Anonymous feedback is available in the student feedback form: three ratings from 1 to 5 and no comments. It is designed so it is not linked to your placement or account, and results are shown only as ward groups with at least three responses. However, its database changes and full testing were not yet confirmed at the time of writing, so treat it as new, and use confidential feedback or a concern if you need follow-up.
<!-- source: docs/verification/anonymous-feedback-implementation-2026-11-09.md, docs/OPEN-QUESTIONS.md, apps/portal/src/features/safeguarding/FeedbackAndSafeguardingPanel.tsx -->

## Can anonymous feedback be followed up?

No. Because it is not linked to you, nobody can reply to it or investigate it individually. If you want someone to act, use confidential feedback or raise a private concern.
<!-- source: apps/portal/src/features/safeguarding/FeedbackAndSafeguardingPanel.tsx, docs/architecture/stage3-business-rules-and-invariants.md -->

## What is the safeguarding concern route for?

It lets students and mentors privately raise worries about professional conduct, safety, harassment or discrimination, or similar. You choose a category and a severity (low, medium, high) and describe it without naming patients. It is confidential, not anonymous: your name is attached.
<!-- source: apps/portal/src/features/safeguarding/FeedbackAndSafeguardingPanel.tsx, backend/apps/safeguarding/services.py -->

## Who receives and reviews a safeguarding concern?

Nurse managers at the facility are notified. For high severity, coordinators at the institution are also notified. Authorised reviewers (a nurse manager, a coordinator for high severity, or a programme administrator) assign a reviewer, record a finding and action, and close the concern. The subject of a concern cannot review it. A closed concern cannot be reopened; a recurrence is a new concern.
<!-- source: backend/apps/safeguarding/services.py, docs/architecture/stage3-business-rules-and-invariants.md -->

## Who can read what I wrote in a concern?

Only you, the assigned reviewer and a programme administrator. Lists, dashboards, exports and notifications show only counts and severity. Every time someone opens the description it is logged.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md, backend/apps/safeguarding/services.py -->

## Can Menta handle a safeguarding case?

No. Menta cannot receive, review, escalate or resolve a concern. It can only point you to the private concern route, or to your supervisor. If someone is in danger now, speak to a senior person at the facility immediately.
<!-- source: backend/apps/assistant/service.py, docs/decisions/0027-menta-ai-buddy.md -->

## Why can't Menta give clinical advice?

MentorMAMA is an educational platform, not a clinical tool. Menta is an AI that can make mistakes, so it never gives patient-specific advice, diagnosis, dosing or emergency instructions. Always follow your facility's protocols and ask a senior clinician or your supervisor.
<!-- source: backend/apps/assistant/service.py, docs/decisions/0027-menta-ai-buddy.md -->

## What should I do in a clinical emergency?

Do not use MentorMAMA or Menta. Follow your facility's emergency protocol and call a senior clinician or your supervisor straight away. The orientation guide also covers the emergency process and who to contact.
<!-- source: backend/apps/assistant/service.py, apps/portal/src/features/induction/OrientationPanel.tsx -->

## Is the activity I do recorded?

Yes. Every change is recorded in an audit trail with who did it, when and what changed, without secrets or restricted text. Reading safeguarding descriptions, individual feedback and data exports are also logged. Programme administrators can review Activity.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md, backend/apps/identity/urls.py -->

## What data can be exported?

Nurse managers, coordinators and programme administrators can export placement records for their scope: names, email, cohort, facility, ward, state, dates, mentor, sessions logged, induction percentage, final assessment submitted and a count of open concerns. Exports never include session notes, feedback text or concern text. Download links last 15 minutes and each export is logged.
<!-- source: backend/apps/analytics/export_service.py -->

## Does Menta store my conversation or see my private records?

Menta does not keep a server-side history; the recent conversation stays in your browser. It answers from approved platform guides and published material you are allowed to see. It does not read your private records such as safeguarding text or session notes.
<!-- source: docs/decisions/0027-menta-ai-buddy.md, backend/apps/assistant/service.py -->
