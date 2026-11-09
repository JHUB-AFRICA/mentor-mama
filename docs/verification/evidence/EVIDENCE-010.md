# EVIDENCE-010 — Student identity and self-service profile

Requirement(s): student onboarding, institution-owned student records, profile
privacy, and coordinator CSV scope.

Implemented:

- Coordinator student imports require only email, first name, last name,
  registration number, and optional phone.
- Registration numbers are normalized to uppercase and unique within an
  institution.
- Students can complete course/programme, year of study, date of birth, and
  emergency-contact details after activation through a student-only API and
  Profile surface.
- Student profile details are stored separately from placements and are not
  included in mentor-facing placement projections.
- Demographic fields remain intentionally out of scope until a specific,
  privacy-reviewed requirement is approved.

Verification:

- Student onboarding/profile API tests passed.
- Full backend regression passed at 100%.
- Migration consistency check passed.
- Portal lint and production build passed.
- Serial browser regression passed: 5 tests; optional offline test skipped.

Result: PASS for the student identity/profile slice.
