# Mentor batch session and induction verification — 9 November 2026

## Source changes

- Mentor sign-in now loads every server-scoped placement page so a 30+ student
  mentor can search, select a subset, or select all eligible students.
- Session batch creates one placement-scoped session for each selected attendee,
  reports duplicate outcomes per student, and preserves one offline command.
- Orientation surfaces the mentor-owned next step: start induction. Students
  complete their own acknowledgement; mentors can send one idempotent reminder
  request to the selected pending group. Individual student detail checks the
  acknowledgement, explains who owns the next action, and prevents a premature
  induction request.
- Group induction opens the same checklist version for selected attendees,
  saves each answer to each student's checklist, and signs/activates all records
  together. A different answer belongs in the individual checklist.
- Induction checklist copy and visual hierarchy have been redesigned for clear,
  practical steps and consistency with the Mentor workspace.

## Verification outcome

- Django model changes have generated migrations for mentorship and induction.
- `makemigrations --check --dry-run` reports no model changes pending.
- Portal production build and scoped ESLint pass. Portal-wide ESLint reports two
  `prefer-const` errors in the unrelated `e2e/directory-create-acceptance.spec.ts`.
- Targeted API tests could not initialize PostgreSQL because no database service
  is available. Live API and browser acceptance remain unverified; Argent listed
  no running Chromium or mobile device, and the local resource-health check had
  the existing 7% free-disk gate.

## Manual acceptance when services are available

1. Sign in as a mentor with at least 30 assigned placements and confirm Select
   all and search include records beyond the first API page.
2. Log one shared session for all attendees, then a subset. Verify one record per
   selected placement, matching shared content, and accurate duplicate outcomes.
3. Queue a batch offline, reconnect, and confirm one complete batch syncs.
4. Request reminders for pending orientation acknowledgements. Confirm students
   receive the reminder and still have to personally acknowledge.
5. Complete an induction group with the same template. Verify each checklist is
   separate, an incomplete required item blocks all signatures, and successful
   signatures activate all selected placements atomically.
6. Try a mixed-template or unauthorized placement selection and confirm no
   partial write occurs.
