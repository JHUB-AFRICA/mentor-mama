# Coordinator Overview audit

**Review date:** 2026-09-02
**Status:** Design review before the next page

## What is working

- The page has one clear subject: institution coordination.
- Hero actions are correctly limited to placement review and cohort management.
- Metric cards are compact and reserved for distinct counts.
- The decision queue appears before monitoring content.
- Monitoring is grouped under continuity and safety rather than mixed into the
  primary action area.
- The layout has a single-column mobile state, two-column intermediate state,
  and wider desktop grid without intentional horizontal overflow.
- The fixed role header has reserved content space and the mobile rail has a
  dismissible overlay.

## Must fix before the Overview is considered complete

### 1. Do not show false zeroes on request failure

The Overview combines three independent queries. A failed indicators, cohort,
or student request currently falls through to `0` or an empty derived string.
Each data region needs its own inline error and retry action, while successful
regions remain visible. A failed request must never look like a healthy empty
institution.

### 2. Add the coordinator's institution context

The page currently says “your institution” but does not identify the
institution, academic period, or current scope. Add a safe institution context
read model to the header/hero when the API provides it. Do not add a client-side
institution switcher.

### 3. Show the full placement pipeline

The current snapshot highlights active and completed placements but omits
scheduled, awaiting student, orientation, induction, paused, and blocked
states. The Overview should show a compact pipeline or progression strip, with
the detailed register remaining on Placements.

### 4. Make the queue represent all coordinator decisions

The queue currently covers awaiting student confirmation and safeguarding
concerns. It should also include missing placement setup, unassigned student or
placement handoffs, paused placements needing coordination, and overdue or
blocked progression once those read models exist. Each item needs the affected
count, responsible next actor, and a deep link/filter.

### 5. Surface progression quality signals

The backend already exposes induction and session indicators, but the Overview
does not surface them. Add small institution-level progress signals for
induction completion and mentorship activity, without exposing session free
text or assessment responses.

### 6. Keep scope language institution-specific

Shared monitoring copy currently uses “Programme monitoring” in the coordinator
view. Use “Institution monitoring” so the interface does not imply
programme-wide authority.

## Responsive and accessibility findings

- 375px: structure stacks correctly; continue checking long institution names,
  long queue messages, and button wrapping.
- 768px: two-column metric cards are appropriate; queue action should remain
  reachable without relying on hover.
- 1024px: the shell keeps the fixed header clear of the 17rem rail; verify the
  header title does not collide with notifications/account controls.
- 1440px: the content measure remains readable; avoid expanding monitoring
  panels merely to fill the viewport.
- Add a skip-to-main link to the coordinator shell.
- Mark purely decorative Lucide icons as hidden from assistive technology.
- Keep visible focus styles on every queue action and shell control.
- Use tabular numerals for comparable metric values.
- Use explicit retry messaging for each failed async region.

## Deliberately not added to Overview

- Full student roster: belongs to Cohorts & students.
- Ward allocation controls: belongs to Nurse Manager facility operations.
- Mentor assignment controls: belongs to Nurse Manager operations.
- Detailed placement history: belongs to Placement detail.
- Safeguarding narratives: remain behind authorised review.
- Full feedback responses or assessment scores: remain privacy-restricted.
- Programme readiness counts: belong to Programme Admin, not institution scope.

## Recommended next implementation order

1. Fix independent loading/error/empty states and institution context.
2. Add the placement pipeline and missing coordinator queue read models.
3. Surface induction/session metadata and approved feedback aggregate signals.
4. Perform final responsive/accessibility pass.
5. Move to the Cohorts & students page.
