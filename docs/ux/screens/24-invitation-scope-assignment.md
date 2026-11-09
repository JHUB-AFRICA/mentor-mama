# Invitation scope assignment

## Purpose

Programme Admins configure the programme directory first, then assign each invited account to the organisation where that account operates. This keeps access boundaries explicit from the moment an account is created.

## Role-to-scope rules

| Role | Required scope | Meaning |
|---|---|---|
| University Coordinator | Institution | Coordinates students and programme activity for a university or training institution. |
| Student | Institution | Belongs to the university or training institution. |
| Nurse Manager | Facility | Owns operational coordination at a hospital or maternity facility. |
| Clinical Mentor | Facility | Provides clinical mentorship within a facility. |
| Programme Admin | Programme only | Manages the whole programme; not invited through this scoped team-member modal. |

## Flow

1. Programme Admin creates institutions and facilities in **Programme Settings → Directory**.
2. Programme Admin selects **Invite a team member**.
3. The role selection determines whether the next field is **Institution** or **Facility**.
4. The invitation cannot be submitted until a valid scope is selected.
5. The backend confirms that the selected scope belongs to the active programme and matches the role before creating or rotating the invite.
6. The invite email contains the secure activation link; the recipient completes account activation and any role-required MFA setup.

## Empty and failure states

- If no matching institutions or facilities exist, the scope selector is disabled and the modal directs the Programme Admin to the Directory tab.
- If the directory cannot load, the modal explains that the scope list is unavailable and blocks submission.
- A stale, cross-programme, archived, or role-incompatible scope is rejected server-side with the normal safe authorization error.

## Architecture notes

Identity stores `institution_id` and `facility_id` as bare identifiers by design. The institutions and facilities modules own validation helpers; identity calls those module services before writing the invitation. This preserves the downward dependency boundary and the database role/scope check constraint.
