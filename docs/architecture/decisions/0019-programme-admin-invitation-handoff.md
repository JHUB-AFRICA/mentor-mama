# ADR-0019: Programme Admin invitation handoff and pending-state guidance

**Status:** Accepted for the pilot implementation  
**Date:** 2026-10-01

## Context

The Phase 3 live journey confirmed that the invitation endpoint accepts the
correct Coordinator/institution and Nurse Manager/facility scopes. However, the
Overview previously counted only active operational leads, so it could
recommend another invite while invitations for that role were still pending.
The generic “Invited” label and queued-delivery message also did not make the
distinction between invitation creation, email delivery, and recipient
activation clear enough.

## Decisions

1. Keep invitation authorization and role/scope validation in the existing
   identity APIs. The Overview may start an invite with a role preselected, but
   it must not grant, infer, or change the recipient's authorized scope.
2. Add programme-scoped active and invited counts for Coordinators and Nurse
   Managers to the existing dashboard summary. Return counts only; never return
   recipient names or email addresses in this aggregate.
3. Show pending invitation counts separately from active accounts. A pending
   invitation is neither proof of email delivery nor proof that the recipient
   accepted and activated their account. When an operational role has pending
   invitations, the Overview's primary action opens People & access for review.
4. Provide role-specific invite shortcuts in the initial Getting started
   operational-access step. The invite form selects an institution or facility
   automatically only when exactly one active matching scope exists; otherwise
   the Programme Admin explicitly chooses the intended scope.
5. After an invite request succeeds, name its role and scope, say it was queued
   for delivery, explain that access remains pending until acceptance, and link
   to People & access for review or resend.
6. Use the shared accessible-dialog behavior for initial focus, keyboard focus
   containment, Escape close, and return focus to the trigger.

## Consequences

- The dashboard summary response changes additively and requires no database
  migration. The role counts are computed in the existing programme-scoped
  aggregate query.
- People & access calls the account state “Invitation pending” to avoid
  suggesting delivery or acceptance.
- Actual delivery/bounce visibility remains a separate integration with the
  existing email outbox or development email sandbox. This decision does not
  enable real outbound mail.
- To roll back, revert the dashboard summary fields and the related portal
  presentation changes. No data migration or persistent setting needs reversal.

## Verification

- Focused backend test verifies role-separated pending counts and confirms the
  summary does not expose recipient email addresses.
- Authenticated browser test verifies role/scope payloads, pending status,
  resend feedback, dialog keyboard behavior, and a 375 px viewport.
- Empty-programme rendering of the Getting started shortcuts and recipient email
  delivery/activation remain follow-up acceptance work.
