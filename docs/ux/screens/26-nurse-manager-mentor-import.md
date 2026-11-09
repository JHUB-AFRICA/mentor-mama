# Nurse Manager mentor import

The Nurse Manager onboarding flow mirrors the Coordinator student flow, with the facility as the security boundary.

1. Programme Admin creates a facility.
2. Programme Admin invites a Nurse Manager and assigns that facility.
3. The Nurse Manager uploads a CSV or XLSX containing mentor email, first name, last name, and optional phone.
4. The system previews duplicate and account conflicts without sending email.
5. The Nurse Manager confirms the valid rows.
6. Clinical mentor accounts are created with the Nurse Manager’s facility scope and receive activation invitations.

The browser reuses the shared scoped-import interface. The backend accepts the command only from an active Nurse Manager with a facility scope; a facility ID is never accepted from the uploaded file.
