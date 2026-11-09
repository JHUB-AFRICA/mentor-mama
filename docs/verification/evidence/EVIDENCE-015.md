# EVIDENCE-015 — Completion blockers and mentorship handoff hardening

Date: 2026-08-31

## Outcome

Placement completion blockers now return safe, actionable messages through the
versioned transitions contract. The portal already renders these messages in
the placement detail’s “What is still needed” section, so coordinators and
facility operators can understand the next action without receiving restricted
safeguarding content.

Examples:

- `FinalAssessmentMissing` → “Student final assessment is required before completion.”
- `OpenEscalationBlocksCompletion` → “Resolve the open safeguarding concern before completion.”

Safeguarding responses continue to expose only count/severity metadata and not
the concern description.

## Verification

- Focused completion and mentorship tests: 12 passed.
- Full backend regression: passed 100%.
- Backend Ruff checks: passed.
- Portal lint: passed.
- `git diff --check`: passed.
- Existing mentor session offline browser journey and signed induction journey
  remain covered by the preceding E2E evidence.

## Resource note

The environment remains constrained at approximately 12% free disk. No
processes, containers, caches, or files were stopped or deleted. Additional
resource-heavy browser verification should be scheduled after authorized disk
remediation.

## Next focus

Run the complete role-based completion acceptance journey once capacity is
restored: mentor session, student final assessment, completion blocker clear,
placement completion, archive, and withdrawal-history checks.
