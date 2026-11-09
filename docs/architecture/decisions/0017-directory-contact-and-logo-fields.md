# ADR-0017: Optional directory contact details and partner logos

**Status:** Accepted for the Programme Admin directory
**Date:** 2026-10-01

## Context

Programme Admins need useful institutional and facility records during setup.
Name-only creation required a second edit pass and hid partner contact data that
will be useful for operational coordination. The product may later display
partners on the public MentorMAMA website, but public use requires a separate
consent and publishing decision.

## Decision

- Institution and facility records support optional contact person, email, and
  phone fields.
- Institution and facility records support one optional logo image. Accept PNG,
  JPEG, and WebP images up to 2 MB and 4096 pixels per dimension. SVG is not
  accepted.
- The Programme Admin directory supports logo preview, replacement, and removal.
- Contact values and uploaded files are excluded from audit change payloads;
  audit entries record changed field names and whether a logo changed.
- Collecting a logo does not opt a partner into public display. The public
  website must not consume these directory logos until its publishing workflow,
  consent, asset hosting, and withdrawal behavior are separately approved.
- Facility remains programme-scoped and independent of institution. No
  institution-to-facility ownership relation is added.

## Consequences

- Directory create and edit accept multipart form data when an image is present
  and JSON for metadata-only changes.
- Existing media storage is reused. Production object storage and public-site
  integration remain separate work; local media uploads alone do not provide a
  production asset delivery policy.
- Contact information is operational business data and is exposed only through
  the existing role-scoped directory APIs.
