"""Every portal screen Menta may send a user to, per role.

This registry is the allowlist for Menta's navigation buttons: the model may only
*name* a destination id, and the server resolves it to an href here. Every href
is a real route handled by the portal (see apps/portal/src/features/*/*Workspace.tsx
and app/AuthenticatedRouter.tsx). Keep it in step with the sidebar labels.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from urllib.parse import parse_qs, urlsplit


@dataclass(frozen=True)
class Destination:
    id: str
    label: str
    href: str
    description: str
    asks: tuple[str, ...] = field(default_factory=tuple)

    def as_dict(self) -> dict:
        return {"id": self.id, "label": self.label, "href": self.href, "description": self.description, "asks": list(self.asks)}


D = Destination

REGISTRY: dict[str, tuple[Destination, ...]] = {
    "program_admin": (
        D("overview", "Overview", "/admin", "Programme readiness, items needing attention and quick actions.",
          ("What needs my attention?", "How do I get the programme ready for the pilot?")),
        D("placements", "Placements", "/placements", "The programme-wide placement register and lifecycle actions.",
          ("What do the placement states mean?", "How do I archive a completed placement?")),
        D("reports", "Reports", "/admin/reports", "Programme reports, charts and exports.",
          ("What do the reports show?",)),
        D("people", "People & access", "/admin/people", "Invite people, change roles and access, and manage accounts.",
          ("How do I invite a coordinator or nurse manager?", "How do I suspend an account?")),
        D("recovery", "MFA recovery requests", "/admin/people/recovery",
          "Requests from people who lost their authenticator and need sign-in recovery."),
        D("setup", "Programme setup", "/admin/settings",
          "Programme name, the institution/facility/ward directory, and programme rules such as the training gate.",
          ("How do I add a facility or ward?", "What does the mentor training rule do?")),
        D("content", "Content library", "/admin/content", "Training modules, guides, documents and links for every role.",
          ("How do I publish a training module?", "Who can see a library item?")),
        D("new_module", "Create learning module", "/admin/content/new/module",
          "Author a new training module with lessons and a quiz."),
        D("new_guide", "Create guide", "/admin/content/new/guide", "Write a new library guide."),
        D("new_document", "Upload document", "/admin/content/new/document", "Add a PDF, Word or PowerPoint document to the library."),
        D("activity", "Activity", "/admin/activity", "The programme audit trail of who did what and when."),
        D("account", "Account & security", "/admin/account?tab=security", "Your password, two-step verification and signed-in devices."),
        D("notifications", "Notification settings", "/admin/account?tab=notifications", "Choose which emails you receive."),
    ),
    "coordinator": (
        D("overview", "Overview", "/coordinator", "Your institution's placement pipeline and items needing attention.",
          ("What needs my attention?", "What happens after I release a placement?")),
        D("cohorts", "Cohorts & students", "/coordinator/cohorts", "Your student roster and cohorts (planning groups).",
          ("How do I create a cohort?", "How do I add students to a cohort?")),
        D("students", "Manage students", "/coordinator/students", "Search, filter and inspect every student account in your institution."),
        D("invite_students", "Invite students", "/coordinator/students/invite",
          "Invite one student or upload a CSV roster for a whole cohort.",
          ("What columns does the CSV roster need?",)),
        D("placements", "Placements", "/coordinator/placements", "Your institution's placements and their lifecycle.",
          ("How do I release a placement?", "What can I not do as a coordinator?")),
        D("new_placement", "Create placement", "/coordinator/placements/new", "Create placements for a cohort at a facility."),
        D("batches", "Placement batches", "/coordinator/placements/batches", "Placements created together as a batch."),
        D("reports", "Reports", "/coordinator/reports", "Institution reports and exports."),
        D("activity", "Activity", "/coordinator/activity", "Recent activity across your institution."),
        D("account", "Account & security", "/coordinator/account?tab=security", "Your password, two-step verification and devices."),
    ),
    "nurse_manager": (
        D("overview", "Overview", "/facility", "Your facility's placements, attention queue and mentor coverage.",
          ("What needs my attention?", "What happens when a placement is paused?")),
        D("placements", "Placements", "/placements", "Assign wards and mentors and move placements through their lifecycle.",
          ("How do I assign a mentor?", "How do I pause a placement?")),
        D("mentors", "Mentors", "/facility/mentors", "Your facility's mentors, their workload and training.",
          ("How do I reassign a mentor?",)),
        D("invite_mentors", "Invite mentors", "/facility/mentors/invite", "Invite one mentor or import a list of mentors."),
        D("wards", "Ward operations", "/facility/wards", "Ward capacity, occupancy and open places."),
        D("safeguarding", "Safeguarding", "/facility/safeguarding", "Review safeguarding concerns raised in your facility."),
        D("reports", "Reports", "/facility/reports", "Facility reports and exports.", ("What can I see in facility reports?",)),
        D("activity", "Activity", "/facility/activity", "Recent activity in your facility."),
        D("account", "Account & security", "/facility/account", "Your password, two-step verification and devices."),
    ),
    "mentor": (
        D("overview", "Overview", "/mentor", "Today's students, sessions to log and your next actions.",
          ("What should I do today?",)),
        D("students", "Students", "/mentor?view=students", "Every student placed with you and their progress.",
          ("How do I run induction for a student?",)),
        D("log", "Log session", "/mentor?view=log", "Record a mentorship session for one or many students.",
          ("How do I log a session for several students?", "What are the rules for session dates?")),
        D("induction", "Group induction", "/mentor?view=induction-batch", "Run induction for several students at once."),
        D("training", "Training", "/mentor?view=training", "Your mentor training modules and quizzes.",
          ("What training do I still need to complete?",)),
        D("library", "Library", "/mentor?view=library", "Guides, documents and links published for mentors."),
        D("more", "More", "/mentor?view=more", "Notifications, support and other options."),
        D("account", "Settings", "/account", "Your profile, password, two-step verification and notifications."),
    ),
    "student": (
        D("overview", "Overview", "/student", "Your placement status and what to do next.",
          ("What do I need to do next?",)),
        D("placements", "My placements", "/student?view=placements",
          "Your placements: sign the acknowledgement, orientation, feedback, safeguarding and final assessment.",
          ("How do I sign my placement acknowledgement?", "How do I complete my orientation?")),
        D("sessions", "Sessions", "/student?view=sessions", "The mentorship sessions your mentor has logged with you."),
        D("library", "Library", "/student?view=library", "Guides, documents and links published for students."),
        D("more", "More", "/student?view=more", "Notifications, support and other options."),
        D("profile", "Profile", "/student/profile", "Your student profile details."),
        D("account", "Settings", "/account", "Your password, two-step verification and notifications."),
    ),
}


def for_role(role: str) -> tuple[Destination, ...]:
    return REGISTRY.get(role, ())


def get(role: str, destination_id: str) -> Destination | None:
    return next((d for d in for_role(role) if d.id == destination_id), None)


def _key(href: str) -> tuple[str, str]:
    parts = urlsplit(href)
    view = parse_qs(parts.query).get("view", [""])[0]
    return parts.path.rstrip("/") or "/", view


def current(role: str, page: str) -> Destination | None:
    """Best destination for the user's current path: exact match, then longest prefix."""
    path, view = _key(page or "/")
    destinations = for_role(role)
    exact = next((d for d in destinations if _key(d.href) == (path, view)), None)
    if exact:
        return exact
    candidates = [
        d for d in destinations
        if not _key(d.href)[1] and (path == _key(d.href)[0] or path.startswith(_key(d.href)[0] + "/"))
    ]
    return max(candidates, key=lambda d: len(_key(d.href)[0]), default=None)


# Detail screens have record ids in their paths, so they are not navigation targets,
# but Menta should still know what kind of page the user is looking at.
_DETAIL_SCREENS = (
    ("/student/placements/", "a placement's detail page (tabs: Overview, Journey, Sessions, Support)"),
    ("/mentor/students/", "one student's detail page"),
    ("/coordinator/placements/batches/", "a placement batch's detail page"),
    ("/coordinator/placements/", "a placement's detail page"),
    ("/coordinator/cohorts/", "a cohort's detail page"),
    ("/facility/mentors/", "one mentor's detail page"),
    ("/placements/", "a placement's detail page"),
    ("/admin/content/item/", "a library item's detail page"),
    ("/admin/content/new/", "the content authoring editor"),
)


def screen_label(role: str, page: str) -> str:
    path, _ = _key(page or "/")
    for prefix, label in _DETAIL_SCREENS:
        if path.startswith(prefix) and path != prefix.rstrip("/"):
            if prefix == "/admin/content/new/":
                destination = current(role, page)
                return destination.label if destination and destination.id.startswith("new_") else label
            return label
    destination = current(role, page)
    return destination.label if destination else "an unknown screen"
