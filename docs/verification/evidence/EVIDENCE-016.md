# EVIDENCE-016 — Placement lifecycle history visibility

Date: 2026-08-31

## Outcome

Placement detail responses now include archive timestamps alongside completion
and withdrawal metadata. The management detail surface presents these facts in
the placement header, making the terminal lifecycle state understandable
without opening raw audit data.

The change does not expose withdrawal free-text notes or restricted
safeguarding content. Existing server-side transition authority remains the
only way to complete, archive, or withdraw a placement.

## Verification

- Focused completion/transitions API test: passed.
- Portal lint: passed.
- Portal and web production builds: passed.
- `git diff --check`: passed.

The full backend regression was run and passed immediately before this slice;
this change is transport/UI metadata only and introduces no migration.

## Resource note

The verification environment remains disk constrained at approximately 12% free.
No cleanup or process termination was performed. A dedicated browser journey
for the terminal completion/archive states should run after capacity is
restored.

## Next focus

Complete the role-based acceptance journey for session logging, final student
assessment, completion, archive, and withdrawal history, then begin the
Reporting and Programme Monitoring domain.
