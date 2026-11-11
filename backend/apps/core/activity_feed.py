"""Plain-language activity for people, built from the audit trail.

The audit trail stores technical facts (action codes, transition ids, UUIDs). People never see those.
Each entry is turned into a sentence about what happened, who did it and to whom, and nothing else.
"""

from __future__ import annotations

from django.apps import apps
from django.db.models import Q

from apps.core.models import AuditEntry

STATE_LABELS = {
    "draft": "Draft", "scheduled": "Scheduled", "awaiting_student": "Awaiting student", "orientation": "Orientation",
    "induction": "Induction", "active": "Active", "paused": "Paused", "completed": "Completed",
    "archived": "Archived", "withdrawn": "Withdrawn",
}

# action -> (category, title for others, title when the viewer did it)
TITLES = {
    "placement.create": ("placements", "Placement created", "You created a placement"),
    "placement.facility_requested": ("placements", "Partner facility requested", "You requested partner facilities"),
    "placement.allocate_ward": ("placements", "Ward allocated", "You allocated a ward"),
    "placement.change_ward": ("placements", "Ward changed", "You changed a ward"),
    "placement.share_allocation": ("placements", "Placements shared with students", "You shared placements with students"),
    "placement.requests_declined": ("placements", "Students declined by a facility", "You declined hosting students"),
    "placement.requests_withdrawn": ("placements", "Facility request withdrawn", "You withdrew a facility request"),
    "placement.undo_auto_arrange": ("placements", "Arrangement undone", "You undid an arrangement"),
    "placement.assign_mentor": ("placements", "Mentor assigned", "You assigned a mentor"),
    "placement.reassign_mentor": ("placements", "Mentor changed", "You changed a mentor"),
    "placement.auto_arrange": ("placements", "Students arranged automatically", "You arranged incoming students"),
    "placement.pause": ("placements", "Placement paused", "You paused a placement"),
    "placement.resume": ("placements", "Placement resumed", "You resumed a placement"),
    "placement.assignment_acknowledged": ("placements", "Assignment confirmed", "You confirmed your assignment"),
    "orientation.acknowledged": ("placements", "Orientation acknowledged", "You acknowledged orientation"),
    "orientation.reminder_requested": ("placements", "Orientation reminder sent", "You sent an orientation reminder"),
    "induction.open": ("learning", "Induction opened", "You opened induction"),
    "induction.batch_open": ("learning", "Induction opened", "You opened induction"),
    "induction.answer_item": ("learning", "Induction item completed", "You completed an induction item"),
    "induction.batch_answer": ("learning", "Induction items completed", "You completed induction items"),
    "induction.sign": ("learning", "Induction signed off", "You signed off induction"),
    "induction.batch_sign": ("learning", "Induction signed off", "You signed off induction"),
    "session.log": ("sessions", "Session logged", "You logged a session"),
    "session.batch_log": ("sessions", "Sessions logged", "You logged sessions"),
    "assessment.baseline_submit": ("learning", "Baseline confidence submitted", "You submitted your baseline"),
    "assessment.final_submit": ("learning", "Final assessment submitted", "You submitted your final assessment"),
    "feedback.confidential_submit": ("learning", "Feedback submitted", "You submitted feedback"),
    "learning.module_completed": ("learning", "Training module completed", "You completed a training module"),
    "mentor.availability_changed": ("people", "Mentor availability changed", "You changed your availability"),
    "mentor.profile_updated": ("people", "Mentor profile updated", "You updated your mentor profile"),
    "student.profile_updated": ("people", "Student profile updated", "You updated your profile"),
    "cohort.created": ("cohorts", "Cohort created", "You created a cohort"),
    "cohort.updated": ("cohorts", "Cohort updated", "You updated a cohort"),
    "cohort.archived": ("cohorts", "Cohort archived", "You archived a cohort"),
    "cohort.student_enrolled": ("cohorts", "Student enrolled", "You enrolled a student"),
    "cohort.student_membership_removed": ("cohorts", "Student removed from cohort", "You removed a student from a cohort"),
    "ward.created": ("facility", "Ward added", "You added a ward"),
    "ward.updated": ("facility", "Ward updated", "You updated a ward"),
    "facility.created": ("facility", "Facility added", "You added a facility"),
    "facility.updated": ("facility", "Facility updated", "You updated a facility"),
    "account.invited": ("account", "Invitation sent", "You sent an invitation"),
    "account.bulk_invited": ("account", "Invitations sent", "You sent invitations"),
    "account.invitation_resent": ("account", "Invitation resent", "You resent an invitation"),
    "account.activated": ("account", "Account activated", "You activated your account"),
    "account.password_changed": ("account", "Password changed", "You changed your password"),
    "account.password_reset": ("account", "Password reset", "You reset your password"),
    "account.profile_updated": ("account", "Profile updated", "You updated your profile"),
    "account.sessions_revoked": ("account", "Signed out of other devices", "You signed out of other devices"),
    "account.status_changed": ("account", "Account status changed", "You changed an account status"),
    "account.access_changed": ("account", "Account access changed", "You changed account access"),
    "account.mfa_enabled": ("account", "Two-step sign-in turned on", "You turned on two-step sign-in"),
    "account.email_mfa_enabled": ("account", "Email sign-in code turned on", "You turned on email sign-in codes"),
    "account.email_mfa_disabled": ("account", "Email sign-in code turned off", "You turned off email sign-in codes"),
    "account.backup_codes_regenerated": ("account", "Backup codes renewed", "You renewed your backup codes"),
    "account.email_verified": ("account", "Email verified", "You verified your email"),
    "escalation.raise": ("safeguarding", "Concern raised", "You raised a concern"),
    "escalation.assign_reviewer": ("safeguarding", "Concern assigned to a reviewer", "You took a concern for review"),
    "escalation.record_finding": ("safeguarding", "Concern reviewed", "You recorded a review finding"),
    "escalation.record_action": ("safeguarding", "Concern resolved", "You resolved a concern"),
    "escalation.close": ("safeguarding", "Concern closed", "You closed a concern"),
    "export.download": ("reports", "Report downloaded", "You downloaded a report"),
    "export.requested": ("reports", "Report requested", "You requested a report"),
    "content.published": ("library", "Content published", "You published content"),
    "content.created": ("library", "Content created", "You created content"),
    "content.revised": ("library", "Content updated", "You updated content"),
    "content.unpublished": ("library", "Content unpublished", "You unpublished content"),
    "learning.module_published": ("library", "Training module published", "You published a training module"),
    "learning.module_created": ("library", "Training module created", "You created a training module"),
    "learning.module_revised": ("library", "Training module updated", "You updated a training module"),
}

# Never shown to anyone as activity: they exist for the audit trail, not for people.
HIDDEN = {
    "escalation.read_sensitive", "feedback.confidential_read", "account.mfa_failed", "account.email_mfa_failed",
    "account.email_mfa_challenge_requested", "account.email_mfa_verified", "account.mfa_setup_failed",
    "account.mfa_recovery_requested", "account.mfa_recovery_override", "account.mfa_recovery_request_reviewed",
    "programme.directory_coverage_invalidated", "directory_import.completed",
}
# Safeguarding activity is visible only to the person who raised it or the people reviewing it.
SAFEGUARDING_PREFIX = "escalation."
TRANSITION_TITLES = {
    ("draft", "scheduled"): "Placement scheduled",
    ("scheduled", "awaiting_student"): "Placement released to the student",
    ("awaiting_student", "orientation"): "Student confirmed the placement",
    ("orientation", "induction"): "Induction started",
    ("induction", "active"): "Placement became active",
    ("active", "completed"): "Placement completed",
    ("scheduled", "draft"): "Placement returned to draft",
}


def _transition(entry):
    change = (entry.changes or {}).get("state") or {}
    return change.get("from"), change.get("to")


def _category(action):
    if action.startswith("placement."):
        return "placements"
    return TITLES.get(action, ("general",))[0]


def _titles(entry):
    action = entry.action
    if action.startswith("placement.transition."):
        source, target = _transition(entry)
        if target == "withdrawn":
            return "placements", "Placement withdrawn", "You withdrew a placement"
        if target == "paused":
            return "placements", "Placement paused", "You paused a placement"
        title = TRANSITION_TITLES.get((source, target)) or (f"Placement moved to {STATE_LABELS.get(target, 'a new stage')}" if target else "Placement updated")
        return "placements", title, title
    if action in TITLES:
        return TITLES[action]
    return _category(action), action.split(".")[-1].replace("_", " ").capitalize(), "You made a change"


def _placement_people(placement_ids):
    """placement id -> {'student': name, 'mentor': name, 'facility': name}."""
    if not placement_ids:
        return {}
    StudentAssignment = apps.get_model("placements", "StudentAssignment")
    MentorAssignment = apps.get_model("placements", "MentorAssignment")
    Placement = apps.get_model("placements", "Placement")
    out = {pid: {} for pid in placement_ids}
    for row in StudentAssignment.objects.filter(placement_id__in=placement_ids).select_related("student"):
        out[row.placement_id]["student"] = row.student.full_name
    for row in MentorAssignment.objects.filter(placement_id__in=placement_ids, ended_at=None).select_related("mentor"):
        out[row.placement_id]["mentor"] = row.mentor.full_name
    for pid, name in Placement.objects.filter(id__in=placement_ids).values_list("id", "facility__name"):
        if name:
            out[pid]["facility"] = name
    return out


def user_placement_ids(user):
    StudentAssignment = apps.get_model("placements", "StudentAssignment")
    MentorAssignment = apps.get_model("placements", "MentorAssignment")
    ids = set(StudentAssignment.objects.filter(student=user).values_list("placement_id", flat=True))
    ids |= set(MentorAssignment.objects.filter(mentor=user).values_list("placement_id", flat=True))
    return ids


def related_to(user):
    """Audit entries that belong to this person: their own actions, or things done to their records."""
    uid = str(user.id)
    placements = user_placement_ids(user)
    query = Q(actor=user) | Q(entity_id=user.id) | Q(changes__student_id=uid) | Q(changes__mentor_id=uid) | Q(changes__mentor_id__to=uid)
    if placements:
        query |= Q(entity_id__in=placements) | Q(changes__placement_id__in=[str(p) for p in placements])
    return AuditEntry.objects.filter(query).exclude(action__in=HIDDEN)


def _visible_to(entry, user, own_safeguarding: bool) -> bool:
    if entry.action.startswith(SAFEGUARDING_PREFIX):
        # Only your own actions on a concern; never someone else's activity about one.
        return entry.actor_id == user.id
    if entry.action.startswith("feedback."):
        return entry.actor_id == user.id
    return True


def describe_many(entries, viewer, *, scope_view: bool = False):
    """Entries -> plain-language dicts. `scope_view` is for staff looking at their institution or facility."""
    entries = list(entries)
    placement_ids = {e.entity_id for e in entries if e.entity_table == "placements_placement"}
    people = _placement_people(placement_ids)
    results = []
    for entry in entries:
        if entry.action in HIDDEN or not _visible_to(entry, viewer, False):
            continue
        category, title_other, title_self = _titles(entry)
        by_me = entry.actor_id == viewer.id
        title = title_self if by_me else title_other
        who = "You" if by_me else entry.actor.full_name
        about = people.get(entry.entity_id, {}) if entry.entity_table == "placements_placement" else {}
        parts = []
        if about.get("student") and about["student"] != viewer.full_name:
            parts.append(f"Student: {about['student']}")
        elif about.get("student"):
            parts.append("Your placement")
        if about.get("facility"):
            parts.append(about["facility"])
        if about.get("mentor") and entry.action in {"placement.assign_mentor", "placement.reassign_mentor"} and about["mentor"] != viewer.full_name:
            parts.append(f"Mentor: {about['mentor']}")
        details = []
        source, target = _transition(entry)
        if source and target:
            details.append({"label": "Stage", "value": f"{STATE_LABELS.get(source, source.title())} → {STATE_LABELS.get(target, target.title())}"})
        if entry.override_reason and (scope_view or by_me):
            details.append({"label": "Reason", "value": entry.override_reason})
        results.append({
            "id": str(entry.id),
            "title": title,
            "summary": " · ".join(parts),
            "actor": who,
            "actor_role": "" if by_me else entry.actor_role.replace("_", " "),
            "by_me": by_me,
            "category": category,
            "occurred_at": entry.occurred_at,
            "details": details,
        })
    return results
