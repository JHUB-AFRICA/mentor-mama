"""Approved knowledge Menta may answer from: curated help guides plus the user's own scoped content."""

import re
from functools import lru_cache
from pathlib import Path

from apps.content import api as content_api
from apps.identity import api as identity_api
from apps.learning import api as learning_api

# Factual descriptions of what each role can do in the portal. Keep these short and
# true to the approved role contracts; Menta must not describe features that do not exist.
ROLE_GUIDES = {
    "student": (
        "Students complete their profile, review and sign their placement acknowledgement by typing "
        "their account name, complete orientation, view their session history, read the learning "
        "library, share confidential feedback, raise safeguarding concerns, and submit the final "
        "assessment once the placement is active and past its end date."
    ),
    "mentor": (
        "Mentors see their placement roster, run group induction for students attending the same "
        "handoff, log mentorship sessions (one log can cover up to 100 students), complete assigned "
        "training modules and quizzes, and read notifications."
    ),
    "nurse_manager": (
        "Nurse Managers work within their facility: they assign and reassign mentors and wards, "
        "operate the placement lifecycle, monitor induction and sessions, review authorised "
        "concerns, and export facility reports."
    ),
    "coordinator": (
        "University Coordinators work within their institution: they invite students singly or by "
        "CSV roster, manage cohorts and enrolment, create and release placements, monitor progress, "
        "and view reports and activity. They do not assign wards or mentors."
    ),
    "program_admin": (
        "Programme Administrators manage people and access, the shared facility/ward directory, "
        "the content library and training modules, programme reports, and account recovery."
    ),
}

_WORD = re.compile(r"[a-z]{3,}")
_STOP = frozenset(
    "the and for with that this what how can you are was were from have has not but your about when "
    "where which who why does did into out over any all use using would should could they them their".split()
)
SNIPPET_CHARS = 1_200
MAX_SOURCES = 3
MIN_SOURCE_SCORE = 3
MAX_GUIDE_SECTIONS = 4
GUIDE_DIR = Path(__file__).parent / "knowledge"

ROLE_GUIDE_FILES = {
    "student": "student", "mentor": "mentor", "nurse_manager": "nurse_manager",
    "coordinator": "coordinator", "program_admin": "program_admin",
}
_SOURCE = re.compile(r"<!--\s*source:.*?-->", re.S)


def _terms(text: str) -> set[str]:
    # Light stemming (plural -> singular) so "placements" matches "placement".
    return {
        word[:-1] if word.endswith("s") and len(word) > 4 else word
        for word in _WORD.findall(text.lower())
        if word not in _STOP
    }


@lru_cache(maxsize=1)
def _guide_sections() -> tuple[dict, ...]:
    """Parse the curated markdown knowledge base into independent sections."""
    sections: list[dict] = []
    for path in sorted(GUIDE_DIR.glob("*.md")):
        body = path.read_text(encoding="utf-8")
        for chunk in re.split(r"(?m)^## ", body)[1:]:
            title, _, text = chunk.partition("\n")
            text = _SOURCE.sub("", text).strip()
            if title.strip() and text:
                sections.append({
                    "file": path.stem, "title": title.strip(), "text": text,
                    "title_terms": _terms(title), "terms": _terms(f"{title} {text}"),
                })
    return tuple(sections)


def retrieve_guides(user, question: str, limit: int = MAX_GUIDE_SECTIONS) -> list[dict]:
    """Best-matching curated help sections. Own-role guide sections rank first on ties."""
    wanted = _terms(question)
    own_file = ROLE_GUIDE_FILES.get(user.role)
    other_roles = set(ROLE_GUIDE_FILES.values()) - {own_file}
    scored = []
    for section in _guide_sections():
        overlap = wanted & section["terms"]
        if not overlap:
            continue
        score = 3 * len(wanted & section["title_terms"]) + len(overlap)
        if section["file"] == own_file:
            score += 3
        elif section["file"] in other_roles:
            score -= 1
        scored.append((score, section))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [section for _, section in scored[:limit]]


_AUDIENCE = {
    "student": "students", "mentor": "mentors", "nurse_manager": "nurse managers",
    "coordinator": "coordinators", "program_admin": "programme admins",
}


def _audience(roles: list[str]) -> str:
    return ", ".join(_AUDIENCE.get(role, role) for role in roles) or "no audience set"


def manages_content(user) -> bool:
    return bool(identity_api.capabilities_for(user).get("manage_content"))


def catalogue_text(user) -> str:
    """What this user can open right now: training modules and library items (titles only).

    Content managers see the whole programme library with audience and status,
    because they author and govern it even when they are not its audience.
    """
    lines: list[str] = []
    if manages_content(user):
        modules = learning_api.programme_catalogue(user)
        if modules:
            published = sum(1 for m in modules if m["published"])
            lines.append(f"Training modules in the programme ({published} published, {len(modules) - published} draft):")
            lines += [
                f"- {m['title']} ({'published' if m['published'] else 'draft'}{', required' if m['required'] else ''};"
                f" for {_audience(m['audience'])}; {m['lessons']} lesson(s)){': ' + m['description'] if m['description'] else ''}"
                for m in modules
            ]
        items = content_api.programme_catalogue(user)
        if items:
            lines.append("Library items in the programme:")
            lines += [
                f"- {i['title']} ({i['kind']}, {i['status']}; for {_audience(i['audience'])}){': ' + i['summary'] if i['summary'] else ''}"
                for i in items
            ]
        return "\n".join(lines) or "The programme has no training modules or library items yet. Add them in Content library."
    modules = learning_api.catalogue(user)
    if modules:
        lines.append("Training modules you can open:")
        lines += [
            f"- {m['title']}{' (required)' if m['required'] else ''}{' (completed)' if m['completed'] else ''}"
            f" - {m['lessons']} lesson(s){': ' + m['description'] if m['description'] else ''}"
            for m in modules
        ]
        if user.role == "mentor":
            progress = learning_api.progress(user)
            lines.append(
                f"Your training progress: {progress['completed']} of {progress['total']} modules complete; "
                f"{progress['required_completed']} of {progress['required_total']} required."
            )
    items = content_api.catalogue(user)
    if items:
        lines.append("Library items you can open:")
        lines += [f"- {i['title']} ({i['kind']}, {i['category']}){': ' + i['summary'] if i['summary'] else ''}" for i in items]
    return "\n".join(lines) or "No training modules or library items are published for you yet."


def retrieve(user, question: str) -> list[dict]:
    """Return up to MAX_SOURCES best-matching documents this user is allowed to read."""
    wanted = _terms(question)
    if not wanted:
        return []
    scored = []
    documents = (
        [*learning_api.programme_knowledge_documents(user), *content_api.programme_knowledge_documents(user)]
        if manages_content(user)
        else [*learning_api.knowledge_documents(user), *content_api.knowledge_documents(user)]
    )
    for doc in documents:
        score = 3 * len(wanted & _terms(doc["title"])) + len(wanted & _terms(doc["text"]))
        # A single incidental word (for example "patient") is not relevance.
        if score >= MIN_SOURCE_SCORE:
            scored.append((score, doc))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [doc for _, doc in scored[:MAX_SOURCES]]


def role_guide(role: str) -> str:
    return ROLE_GUIDES.get(role, "")
