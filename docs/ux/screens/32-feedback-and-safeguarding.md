# Feedback and safeguarding

The participant placement detail now provides two separate, clearly labelled
actions:

- Feedback: students choose confidential (placement-linked and follow-up
  possible) or anonymous (fixed ratings grouped by cohort, facility, and ward;
  no written comment, follow-up, or placement/student identifier returned).
  The interface explains that anonymous results appear only after three
  submissions and are not included in placement-level analysis.
- Private concern: students and mentors raise a non-anonymous safeguarding
  concern with category, severity, and narrative. The form explicitly forbids
  patient identifiers.

The server owns the privacy boundary. Escalation lists never serialize the
narrative; a detail read is released only to the submitter or assigned reviewer
and is audited. Review commands are assign reviewer → record finding → record
action → close. Closed concerns cannot be reopened; an external referral is a
resolution outcome.

Reviewer queue/detail is integrated into the dedicated Nurse Manager and
Coordinator dashboards. The queue shows safe metadata only; the detail panel
loads narrative through the audited protected endpoint. A reviewer can assign
the concern to themselves, record a finding, record action and outcome, and
close a resolved concern.
