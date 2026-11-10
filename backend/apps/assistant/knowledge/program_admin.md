# Programme Administrator guide

## What screens do programme administrators have?

The menu has three groups. Operate: Overview, Placements, Reports. Govern: People & access, Programme setup, Content library. Review: Activity. Settings at the bottom opens Account & security, and MFA recovery requests is the screen where pending sign-in recovery requests are reviewed. The account menu also has Notifications and Sign out.
<!-- source: apps/portal/src/features/programme-admin/ProgrammeAdminFrame.tsx, apps/portal/src/features/programme-admin/MFARecoveryInbox.tsx -->

## What can a programme administrator do?

You manage people and access for the whole programme, own the shared directory of institutions, facilities and wards, author and publish library content and training modules, read programme-wide reports and exports, recover accounts, and use a few controlled fallback actions on placements (for example archiving).
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md, docs/product/requirements.md, backend/apps/identity/capabilities.py -->

## What can a programme administrator NOT do?

Configuration authority is not the same as day-to-day authority. You cannot log a session for someone, edit submitted feedback, force an illegal placement state change, see individual feedback, or see another person's password, authenticator secret or recovery codes. The access policy screen is view only.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md, apps/portal/src/features/programme-admin/AccessPolicyPanel.tsx -->

## How do I invite people?

1. Go to People & access and choose "Invite person". (On Overview and Programme setup there are also shortcuts such as "Invite Coordinator" and "Invite Nurse Manager".)
2. In "Invite a team member", enter first name, last name and work email.
3. Choose the Role: University Coordinator, Nurse Manager, Clinical Mentor, Student or Programme Admin.
4. Choose their institution or facility (not needed for a Programme Admin). Students also need a registration number.
5. Choose "Send invitation". The account stays pending until they accept the secure invitation.

<!-- source: apps/portal/src/features/programme-admin/PeopleTable.tsx, apps/portal/src/features/programme-admin/InviteMemberModal.tsx -->

## How do I invite several people at once?

Programme Administrators invite people one at a time with "Invite person" in People & access. Bulk upload from a CSV or Excel file is done by the operational leads: University Coordinators upload student rosters in "Invite students", and Nurse Managers import mentors in "Invite mentors". Every row is checked before anything is sent.
<!-- source: apps/portal/src/features/programme-admin/PeopleTable.tsx, apps/portal/src/features/onboarding/ScopedBulkInviteDashboard.tsx, apps/portal/src/features/coordinator/CoordinatorStudentInvites.tsx, apps/portal/src/features/nurse-manager/NurseManagerWorkspace.tsx -->

## How do I resend an invitation?

In People & access find the invited person and choose "Resend invitation". Only programme administrators can resend. Resending replaces the earlier link, so only the newest works. An account can be re-sent at most three times in 24 hours; after that you must contact programme support.
<!-- source: backend/apps/identity/authentication.py, backend/apps/core/errors.py -->

## How do I suspend or deactivate an account?

In People & access open the person and choose the account action. Suspending pauses access; deactivating ends it. Both end the person's active sessions. A suspended or deactivated person cannot sign in, and a password reset does not restore access. You cannot suspend yourself.
<!-- source: docs/architecture/authentication-and-account-lifecycle.md, backend/apps/identity/views.py -->

## What is the access policy panel?

In People & access, the access policy panel lists what each role can do and whether multi-factor authentication is required. It is read only: "Role permissions are managed by the server policy and cannot be edited from this view."
<!-- source: apps/portal/src/features/programme-admin/AccessPolicyPanel.tsx -->

## How do I handle an MFA recovery request?

Open MFA recovery requests. Each row shows the person, role, their reason and the date. Choose to recover or close the request and write a reason of at least five characters. Recovery removes the person's authenticators and sessions so they set up MFA again. You cannot review your own request; if you are the only administrator, contact platform support.
<!-- source: apps/portal/src/features/programme-admin/MFARecoveryInbox.tsx, docs/architecture/authentication-and-account-lifecycle.md -->

## How do I set up institutions, facilities and wards?

Go to Programme setup. Use "Add institution", "Add facility" and "Add ward" and fill in the details; wards need a maximum number of students. Archive instead of deleting: records are never removed. Any directory change means the pilot coverage review must be confirmed again.
<!-- source: apps/portal/src/features/programme-admin/ProgrammeDirectory.tsx, docs/product/requirements.md -->

## Can I import directory records from a file?

Programme setup has an "Import directory records" dialog, but one on-screen message says to add records individually until bulk import is enabled. If the import dialog is not available to you, add records one by one.
<!-- source: apps/portal/src/features/programme-admin/ProgrammeDirectory.tsx -->

## Can I lower a ward's capacity?

Only down to the number of students currently placed there. Lower than that is rejected.
<!-- source: backend/apps/core/errors.py, docs/product/requirements.md -->

## How do I add content to the Content library?

Go to Content library and start a new item (guide, document or external resource). Add the title, description and body, link or file, set who can see it, and choose "Save draft". When the "Publishing checklist" is satisfied choose Publish. Documents must be PDF, DOCX or PPTX up to 20 MB; cover images must be under 2 MB.
<!-- source: apps/portal/src/features/content/ContentAuthoringWorkspace.tsx, backend/apps/content/serializers.py -->

## How do I create a training module?

In Content library create a training module: add lessons, a knowledge check with questions and options with the correct answer, a pass mark (default 70), and whether it is Required. A module needs at least one lesson to be published. Editing a published module unpublishes it until you publish it again.
<!-- source: apps/portal/src/features/content/ContentAuthoringWorkspace.tsx, backend/apps/learning/views.py -->

## How do I publish or archive library content?

In Content library use "Publish content" or "Archive content" on the item. Only published items shared with a role are visible to that role. Drafts and archived items are visible only to administrators.
<!-- source: apps/portal/src/features/content/ContentLibrary.tsx, backend/apps/content/views.py -->

## What do Reports and Activity show?

Reports shows programme-wide counts and trends and lets you choose "Export report" as CSV, Excel, JSON or PDF. Activity is a timeline of recent actions across the programme. Exports contain counts and flags only, and links last 15 minutes.
<!-- source: apps/portal/src/features/programme-admin/Reports.tsx, apps/portal/src/features/programme-admin/ActivityTimeline.tsx -->

## How do I manage placements as an administrator?

Placements lists all placements in the programme with their next step (for example "Release placement" or "Archive record"). You can use the same actions as coordinators and nurse managers when needed, and only you can archive a completed placement. The 30-day automatic archive described in the design is not confirmed to be running, so archive manually.
<!-- source: apps/portal/src/features/placements/PlacementManagement.tsx, backend/apps/placements/services.py -->

## What happens next when I invite someone?

They receive an email link valid for 48 hours, set a password, verify their email, and (for administrators, coordinators and nurse managers) set up multi-factor authentication before they can use the portal.
<!-- source: backend/apps/identity/authentication.py, docs/architecture/authentication-and-account-lifecycle.md -->
