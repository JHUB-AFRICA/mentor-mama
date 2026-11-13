"""Create a complete, believable demo programme for presentations.

    python manage.py seed_demo --admin-email you@example.org --student-email other@example.org
    python manage.py seed_demo --retire-existing ...        # start over (see below)

What it builds: one isolated programme ("MentorMAMA Demo Programme", flagged `is_demo`) with two universities and two
hospitals, a person for every role, cohorts, students at every stage of the placement lifecycle, weeks of mentorship
sessions, induction, confidential and anonymous feedback, safeguarding concerns, training modules with completions and
certificates, a resource library and in-app notifications.

Everything goes through the real services (so audit entries, assignments and rules are genuine) and only history is
back-dated. No email is sent while seeding: the outbox events it creates are turned into in-app notifications and
marked delivered. Only the two real addresses you pass in can ever receive demo mail (see DEMO_EMAIL_ALLOWLIST); all
other people use ``@<DEMO_EMAIL_DOMAIN>`` addresses that are never emailed.

A **next cohort** at each school (about 58 and 25 students) starts shortly and is deliberately left at different
points of the placement pipeline, all created through the real services: students with no placement yet, a block
waiting for a facility request (so the presenter can run the automatic split live), a block already requested of a
facility (its nurse manager sees incoming requests and a capacity warning), a block arranged by a real allocation run
(some unplaced, with reasons), students shared with and released to, a declined request, and two placement batches.

One-tap sign-in on the login screen only works while DEMO_MODE=true on the server.
"""

from __future__ import annotations

import datetime as dt
import json
import random
import uuid

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import get_random_string
from django.utils.text import slugify

from apps.assessments import services as assessment_services
from apps.core import audit
from apps.content.models import ContentItem
from apps.core.models import OutboxEvent
from apps.facilities.models import Facility, Ward
from apps.identity.models import MentorProfile, Program, Role, Status, User
from apps.induction import services as induction_services
from apps.induction.models import TemplateItem
from apps.institutions.models import Cohort, CohortMembership, Institution, StudentProfile
from apps.learning import certificates, versioning
from apps.learning.models import Lesson, ModuleCompletion, Quiz, QuizAttempt, QuizQuestion, TrainingModule
from apps.mentorship.models import Session, SessionFollowUp, SessionTopic
from apps.notifications import services as notification_services
from apps.placements import allocation, notices, planning
from apps.placements import services as placement_services
from apps.placements.models import AllocationRun, MentorAssignment, Placement, PlacementBatch, State, StudentAssignment, WardAssignment
from apps.placements.tasks import run_placement_batch
from apps.safeguarding import services as safeguarding_services
from apps.safeguarding.models import ResolutionOutcome

PROGRAMME_NAME = "Safe Motherhood Mentorship Programme"


# --------------------------------------------------------------------------- lesson body helpers (editor JSON)

def _text(value, *marks):
    node = {"type": "text", "text": value}
    if marks:
        node["marks"] = [{"type": m} for m in marks]
    return node


def _p(*parts):
    return {"type": "paragraph", "content": [_text(x) if isinstance(x, str) else x for x in parts]}


def _h(level, value):
    return {"type": "heading", "attrs": {"level": level}, "content": [_text(value)]}


def _ul(*items):
    return {"type": "bulletList", "content": [{"type": "listItem", "content": [_p(i)]} for i in items]}


def _callout(variant, value):
    return {"type": "callout", "attrs": {"variant": variant}, "content": [_p(value)]}


def doc(*blocks) -> str:
    return json.dumps({"type": "doc", "content": list(blocks)})


# --------------------------------------------------------------------------- content

MODULES = [
    {
        "title": "Foundations of clinical mentorship", "category": "mentorship", "required": True, "roles": ["mentor"], "pass": 70,
        "description": "What good mentorship looks like on a busy maternity ward, and how to give students a safe, structured start.",
        "lessons": [
            ("Welcome", "The mentor's role", 6, doc(
                _h(2, "Why mentorship matters"),
                _p("Students learn clinical judgment, communication and respectful care from the people they work beside. A short, predictable routine from the first shift makes that learning safer for the student and for mothers."),
                _callout("tip", "Three minutes at the start of a shift to agree what the student will practise is worth more than an hour of unplanned supervision."),
                _h(3, "A mentor's four jobs"),
                _ul("Orient the student to the ward and its emergency routines.", "Supervise and teach at the bedside.", "Give timely, specific, kind feedback.", "Record what was covered so the next shift can build on it."))),
            ("Welcome", "Setting expectations on day one", 7, doc(
                _h(2, "The first conversation"),
                _p("Agree learning objectives, shift pattern, who to call for help, and what the student may and may not do unsupervised."),
                _callout("safety", "A student never performs a procedure unsupervised until you have seen them do it safely and agreed this together."),
                _p("Write the agreed objectives in the induction checklist so they are visible to the student, the ward and the university."))),
            ("Teaching", "Teaching at the bedside", 8, doc(
                _h(2, "Show, tell, do, review"),
                _ul("Show the skill and say what you are doing and why.", "Let the student explain it back.", "Supervise the student doing it.", "Review together straight afterwards."),
                _p("Keep reviews short. One thing done well and one thing to improve is enough."))),
            ("Teaching", "Feedback that helps", 7, doc(
                _h(2, "Specific, timely, kind"),
                _p("Name what the student did, the effect it had, and one change to try next time. Avoid general praise or criticism."),
                _callout("info", "Ask first: \"How do you think that went?\" Students often spot the issue themselves."))),
        ],
        "questions": [
            ("What is the best use of the first few minutes of a shift with a student?", ["Let them observe silently", "Agree what they will practise and who to call for help", "Give them a list of tasks to complete alone"], "Agree what they will practise and who to call for help", "A short plan makes the shift safer and more useful."),
            ("A student has not yet shown you they can perform a procedure safely. What should happen?", ["They may do it if the ward is busy", "They do it only under direct supervision", "They watch a video first and then do it alone"], "They do it only under direct supervision", "Independence is agreed after safe practice is observed."),
            ("Which is the most useful feedback?", ["\"Good job today.\"", "\"You need to improve.\"", "\"You checked the fetal heart rate before and after the contraction. Next time, record it straight away.\""], "\"You checked the fetal heart rate before and after the contraction. Next time, record it straight away.\"", "Good feedback is specific and gives one next step."),
        ],
    },
    {
        "title": "Respectful maternity care", "category": "clinical", "required": True, "roles": ["mentor", "student", "nurse_manager"], "pass": 70,
        "description": "Dignity, privacy, consent and communication in labour and postnatal care, and how mentors model them.",
        "lessons": [
            ("Principles", "What respectful care looks like", 6, doc(
                _h(2, "Dignity in every interaction"),
                _ul("Greet the woman and explain who you are.", "Protect privacy: curtains, voices, doors.", "Ask permission before examinations and explain each step.", "Offer choices and listen to preferences."),
                _callout("info", "Students copy what they see. Your behaviour at the bedside is the strongest lesson you teach."))),
            ("Principles", "Consent and communication", 7, doc(
                _h(2, "Consent is ongoing"),
                _p("Consent is not one signature. It is a conversation that continues through labour. Check in before each new procedure and respect a woman's decision to say no."),
                _callout("safety", "Never discuss a mother's care where others can overhear, and never record anything that could identify her in MentorMAMA."))),
            ("In practice", "When things go wrong", 5, doc(
                _h(2, "Speaking up"),
                _p("If a student sees or experiences disrespectful care, they should be able to raise it without fear. Make sure they know who to tell and that they can use the confidential concern route in MentorMAMA."))),
        ],
        "questions": [
            ("A woman in labour asks you to stop an examination. What do you do?", ["Finish quickly, it is almost done", "Stop, explain, and continue only if she agrees", "Ask the student to continue instead"], "Stop, explain, and continue only if she agrees", "Consent can be withdrawn at any time."),
            ("Which belongs in a MentorMAMA session note?", ["The mother's name", "What was practised and the student's next step", "The baby's weight"], "What was practised and the student's next step", "MentorMAMA never holds patient-identifiable information."),
        ],
    },
    {
        "title": "Labour ward induction essentials", "category": "clinical", "required": False, "roles": ["mentor", "student"], "pass": 70,
        "description": "A quick reference for orienting a new student to the labour ward safely in their first shift.",
        "lessons": [
            ("Orientation", "Layout, equipment and emergency exits", 5, doc(
                _h(2, "Walk the ward together"),
                _ul("Emergency exits and assembly point", "Handwashing points and PPE", "Where emergency drugs and equipment are kept", "Staff room, changing areas and rest breaks"))),
            ("Orientation", "Emergency escalation", 6, doc(
                _h(2, "Know who to call"),
                _callout("safety", "In an emergency a student calls for help first, then assists. Agree the call route for each shift on day one."),
                _p("Practise the escalation steps aloud so they are familiar before they are needed."))),
        ],
        "questions": [
            ("In an emergency, what does a student do first?", ["Try to manage alone", "Call for help", "Document what happened"], "Call for help", "Calling for help comes before everything else."),
        ],
    },
    {
        "title": "Supporting students through difficult shifts", "category": "wellbeing", "required": False, "roles": ["mentor", "nurse_manager"], "pass": 70,
        "description": "Recognising stress, debriefing after distressing events and knowing when to refer a student for support.",
        "lessons": [
            ("Wellbeing", "Debriefing after a hard case", 6, doc(
                _h(2, "A short, kind debrief"),
                _p("After a distressing event, find ten quiet minutes. Ask what happened, how the student is feeling, and what support they need. Do not rush to fix."),
                _callout("tip", "If a student seems overwhelmed, use the \"Student support referral\" follow-up in the session log."))),
        ],
        "questions": [
            ("After a distressing birth, what is the most helpful first step?", ["Tell the student to move on", "Offer a short, quiet debrief", "Assign them the next case immediately"], "Offer a short, quiet debrief", "A calm debrief helps students process and learn."),
        ],
    },
]

LIBRARY = [
    ("Mentor's quick guide: the first shift", "guide", "onboarding", "A one-page routine for welcoming a student on their first shift.", ["onboarding", "first shift"], doc(
        _h(2, "Before the shift"), _ul("Check who is allocated to you and read their learning objectives.", "Agree where the student can find you."),
        _h(2, "During the shift"), _ul("Introduce the student to the team.", "Walk the ward and the emergency routes.", "Plan one skill to practise."),
        _h(2, "End of shift"), _p("Debrief for five minutes and log the session in MentorMAMA."))),
    ("Giving feedback in three minutes", "guide", "clinical_care", "A simple structure for quick, useful feedback at the bedside.", ["feedback", "teaching"], doc(
        _h(2, "The 3-step model"), _ul("What went well (be specific).", "One thing to change next time.", "How you will check it together."),
        _callout("tip", "Write the follow-up in your session log so the next mentor can continue where you stopped."))),
    ("Raising a safeguarding concern", "guide", "safeguarding", "How students and mentors raise a concern, and who can see it.", ["safeguarding", "concerns"], doc(
        _h(2, "You choose who reviews it"), _p("Whoever raises a concern chooses the nurse manager, the university coordinator, or both. Nobody else can see it."),
        _callout("safety", "Never include a patient's name or details. Describe what happened to you or the student."))),
    ("Respectful maternity care checklist", "guide", "clinical_care", "A bedside checklist for dignity, privacy and consent.", ["respectful care"], doc(
        _h(2, "Every interaction"), _ul("Introduce yourself.", "Protect privacy.", "Ask permission and explain each step.", "Offer choices and listen."))),
    ("World Health Organization: maternal health", "external", "reference", "Global guidance and resources on maternal health.", ["reference", "WHO"], ""),
    ("Kenya Ministry of Health", "external", "reference", "National policies and guidelines.", ["reference", "Kenya"], ""),
]

# --------------------------------------------------------------------------- people

# (first, last, role-specific key)
COORDINATORS = [("Peter", "Njoroge", "msn"), ("Mercy", "Chebet", "rosami")]
MANAGERS = [("Grace", "Muthoni", "greenville"), ("David", "Mutua", "lakeview")]
MENTORS = [
    ("Esther", "Wanjiru", "greenville", {"cadre": "Registered midwife", "department": "Labour ward", "years_of_practice": 12, "mentorship_experience_years": 6, "digital_literacy": 4}),
    ("Joseph", "Kimani", "greenville", {"cadre": "Registered nurse-midwife", "department": "Postnatal ward", "years_of_practice": 8, "mentorship_experience_years": 3, "digital_literacy": 3}),
    ("Lucy", "Akinyi", "greenville", {"cadre": "Registered midwife", "department": "Antenatal ward", "years_of_practice": 10, "mentorship_experience_years": 4, "digital_literacy": 4}),
    ("Mary", "Ndunge", "lakeview", {"cadre": "Registered midwife", "department": "Labour ward", "years_of_practice": 9, "mentorship_experience_years": 4, "digital_literacy": 3}),
    ("Samuel", "Mwangi", "lakeview", {"cadre": "Registered nurse-midwife", "department": "Postnatal ward", "years_of_practice": 6, "mentorship_experience_years": 1, "digital_literacy": 3}),
    # Added for the next cohort, so a large intake has enough mentors to spread across.
    ("Agnes", "Wafula", "greenville", {"cadre": "Registered midwife", "department": "Labour ward", "years_of_practice": 11, "mentorship_experience_years": 5, "digital_literacy": 4}),
    ("Hassan", "Omar", "greenville", {"cadre": "Registered nurse-midwife", "department": "Antenatal ward", "years_of_practice": 7, "mentorship_experience_years": 2, "digital_literacy": 3}),
    ("Rose", "Kerubo", "lakeview", {"cadre": "Registered midwife", "department": "Labour ward", "years_of_practice": 13, "mentorship_experience_years": 7, "digital_literacy": 4}),
]

# How many more students each mentor can take. Lucy is already at her limit; the others leave room for the next cohort.
MENTOR_LIMITS = {"Esther": 12, "Joseph": 10, "Lucy": 1, "Agnes": 8, "Hassan": 6, "Mary": 8, "Samuel": 6, "Rose": 6}

FIRST_NAMES = ["Amina", "Brenda", "Caleb", "Doreen", "Elijah", "Felix", "Gladys", "Harun", "Irene", "Job", "Kendi", "Lydia", "Moses", "Nancy", "Oscar",
               "Purity", "Quentin", "Rebecca", "Silas", "Trizah", "Ursula", "Victor", "Wanjiku", "Yusuf", "Zawadi", "Abigael", "Boniface", "Cecilia",
               "Daudi", "Edna", "Felista", "George", "Hilda", "Ibrahim", "Jacinta", "Kelvin", "Linet", "Martin", "Njoki", "Omondi", "Pauline", "Ronald",
               "Sharon", "Titus", "Vivian", "Wycliffe", "Alice", "Barnabas", "Carol", "Dickson"]
LAST_NAMES = ["Abuga", "Bett", "Cheruiyot", "Dola", "Ekiru", "Gitau", "Hinga", "Imbuga", "Juma", "Kariuki", "Lagat", "Macharia", "Nyongesa", "Ogola",
              "Pesa", "Rotich", "Simiyu", "Tanui", "Wekesa", "Yego", "Zulu", "Adhiambo", "Barasa", "Chelimo", "Kosgei", "Langat", "Maina", "Njuguna",
              "Oduor", "Wafula", "Mburu", "Kirui", "Ngugi", "Odhiambo", "Waweru", "Kamau", "Ochieng", "Muriuki", "Sang", "Kibet", "Tuwei", "Owino"]

#: The next cohort at each school. Counts per pipeline block are set in ``_next_cohort_stages``.
NEXT_COHORTS = {
    "msn": {"name": "BSc Midwifery Year 3, 2026 Intake B", "students": 58, "start_offset": 14, "reg": "SN", "reg_base": 2000, "planned_capacity": 60},
    "rosami": {"name": "Diploma in Midwifery, 2026 Block 3", "students": 25, "start_offset": 21, "reg": "MW", "reg_base": 3000, "planned_capacity": 30},
}
PLACEMENT_LENGTH_DAYS = 63

# key, first, last, institution, scenario, ward, mentor first-name, start offset (days from today), length (days), baseline, final, sessions
STUDENTS = [
    ("faith", "Faith", "Achieng", "msn", "active", ("greenville", "Labour Ward"), "Esther", -42, 77, 35, None, 11),
    ("brian", "Brian", "Otieno", "msn", "active", ("greenville", "Labour Ward"), "Esther", -38, 77, 42, None, 8),
    ("cynthia", "Cynthia", "Wangari", "msn", "active", ("greenville", "Postnatal Ward"), "Joseph", -35, 70, 50, None, 7),
    ("kevin", "Kevin", "Mutiso", "msn", "active", ("greenville", "Antenatal Ward"), "Lucy", -30, 70, 40, None, 6),
    ("ann", "Ann", "Njeri", "msn", "paused", ("greenville", "Postnatal Ward"), "Joseph", -45, 70, 45, None, 6),
    ("mercy", "Mercy", "Atieno", "msn", "completed", ("greenville", "Labour Ward"), "Esther", -100, 60, 38, 82, 12),
    ("dennis", "Dennis", "Kiprop", "msn", "completed", ("greenville", "Antenatal Ward"), "Lucy", -100, 60, 45, 74, 9),
    ("lilian", "Lilian", "Wambui", "msn", "induction", ("greenville", "Labour Ward"), "Esther", -3, 63, 48, None, 0),
    ("winnie", "Winnie", "Auma", "msn", "draft", None, None, 14, 63, None, None, 0),
    ("tom", "Tom", "Barasa", "msn", "enrolled", None, None, 0, 0, None, None, 0),
    ("joy", "Joy", "Chebet", "rosami", "active", ("lakeview", "Labour Ward"), "Mary", -28, 70, 44, None, 7),
    ("peter", "Peter", "Musyoka", "rosami", "active", ("lakeview", "Postnatal Ward"), "Samuel", -25, 70, 52, None, 4),
    ("salome", "Salome", "Nduta", "rosami", "orientation", ("lakeview", "Labour Ward"), "Mary", 2, 60, 40, None, 0),
    ("hellen", "Hellen", "Moraa", "rosami", "awaiting", ("lakeview", "Postnatal Ward"), "Samuel", 9, 60, None, None, 0),
    ("isaac", "Isaac", "Karanja", "rosami", "scheduled", ("lakeview", "Labour Ward"), "Mary", 16, 60, None, None, 0),
    ("naomi", "Naomi", "Chepkoech", "rosami", "withdrawn", None, None, 10, 60, None, None, 0),
]

SESSION_PLAN = [
    ("orientation", ["Ward orientation", "Emergency preparedness"], "Walked the ward together: exits, handwashing points, PPE area and where emergency equipment is kept. Agreed the call route for emergencies.", "Good attention to infection prevention. Practise explaining the emergency call route in your own words.", "none"),
    ("bedside_teaching", ["Antenatal care", "Documentation"], "Practised antenatal assessment and clear documentation. Student explained each step aloud before performing it.", "Clear communication with the mother. Record observations straight after the visit instead of at the end of the shift.", "review_reading"),
    ("skills_discussion", ["Partograph use", "Labour monitoring"], "Reviewed partograph plotting and what each line tells us about labour progress. Discussed when to escalate.", "Plotting is accurate. Say out loud what you would do when the line crosses the alert line.", "repeat_demonstration"),
    ("debrief", ["Respectful maternity care", "Communication"], "Debriefed after a busy shift. Talked through how privacy and consent were protected at each step.", "You asked permission before each examination, which is exactly right. Keep doing it when the ward is busy.", "none"),
    ("bedside_teaching", ["Newborn care", "Infection prevention"], "Supervised immediate newborn care: drying, warmth, skin-to-skin and cord care. Revised hand hygiene moments.", "Warmth and bonding were handled well. Double-check hand hygiene before each contact.", "practice_skill"),
    ("case_reflection", ["Obstetric emergencies", "Teamwork"], "Reflected on an emergency drill. Student described their role and where communication could be clearer.", "Excellent self-reflection. Next drill, try leading the handover to the team.", "review_next_shift"),
    ("feedback", ["Professional conduct", "Time management"], "Mid-placement feedback. Reviewed the learning objectives agreed on day one and updated two of them.", "Punctual and well prepared. Aim to ask for help earlier when a task is new.", "none"),
    ("skills_discussion", ["Postnatal care", "Breastfeeding support"], "Discussed postnatal checks and supporting a mother to breastfeed. Student demonstrated positioning.", "Good positioning. Add the warning signs you will tell the mother before discharge.", "review_reading"),
    ("bedside_teaching", ["Active management of third stage", "Safe drug administration"], "Supervised the steps of active management of third stage and the safe checks before giving any drug.", "Steady and methodical. Say the five rights aloud every time until it is automatic.", "repeat_demonstration"),
    ("case_review", ["Documentation", "Communication"], "Reviewed a de-identified case summary together to practise clear, complete documentation without personal identifiers.", "Notes are complete and professional. Keep them short and factual.", "none"),
    ("wellbeing_support", ["Wellbeing", "Resilience"], "Checked in after a difficult shift. Talked about coping, rest and who to talk to.", "It is normal to feel affected. Please use the support options we discussed.", "student_referral"),
    ("planning", ["Learning objectives", "Next steps"], "Planned the remaining weeks: skills to practise, cases to observe and what to bring to the final assessment.", "You are on track. Focus on independent decision making with supervision.", "none"),
]


class Command(BaseCommand):
    help = "Create the isolated demo programme with rich data for every role (presentations)."

    def add_arguments(self, parser):
        parser.add_argument("--admin-email", default="", help="Real inbox for the demo Programme Administrator (receives demo email).")
        parser.add_argument("--admin-name", default="Jane Wairimu")
        parser.add_argument("--student-email", default="", help="Real inbox for the demo student (receives demo email).")
        parser.add_argument("--student-name", default="Faith Achieng")
        parser.add_argument("--password", default="", help="Password for every demo account. Default: random (one-tap sign-in needs none).")
        parser.add_argument("--retire-existing", action="store_true",
                            help="Retire a previous demo programme (deactivates its people and frees their emails) before creating a new one.")

    # ------------------------------------------------------------------ entry

    def handle(self, *args, **options):
        self.rng = random.Random(2026)
        self.today = timezone.localdate()
        self.domain = settings.DEMO_EMAIL_DOMAIN
        self.password = options["password"] or get_random_string(24)
        self.options = options
        existing = Program.objects.filter(is_demo=True)
        if existing.exists():
            if not options["retire_existing"]:
                raise CommandError("A demo programme already exists. Re-run with --retire-existing to replace it.")
            self._retire(existing)
        started = timezone.now()
        with transaction.atomic():
            self._people_and_directory()
            self._training()
            self._library()
            self._placements()
            self._next_cohorts()
            self._feedback_and_concerns()
            self._finish_people()
        self._notifications(started)
        call_command("refresh_analytics", verbosity=0)
        self._report()

    # ------------------------------------------------------------------ helpers

    def _email(self, first: str, last: str, real: str = "") -> str:
        return real.strip().lower() or f"{first}.{last}".lower().replace(" ", "") + f"@{self.domain}"

    def _user(self, *, first, last, role, email, institution=None, facility=None, reg="", phone=""):
        user = User.objects.create_user(
            email=email, password=self.password, first_name=first, last_name=last, role=role, status=Status.ACTIVE,
            program=self.program, institution_id=institution.id if institution else None, facility_id=facility.id if facility else None,
            registration_number=reg, phone=phone or f"+2547{self.rng.randint(10000000, 99999999)}",
            email_verified_at=timezone.now(),
        )
        return user

    def _retire(self, programmes):
        for programme in programmes:
            tag = str(programme.id)[:8]
            for user in programme.users.all():
                local = user.email.split("@")[0].replace("+", ".")
                User.objects.filter(id=user.id).update(
                    email=f"retired-{tag}-{local}@{self.domain}", status=Status.DEACTIVATED, is_staff=False,
                )
            Program.objects.filter(id=programme.id).update(is_demo=False, demo_logins={}, name=f"{programme.name} (retired {tag})")
            self.stdout.write(f"Retired demo programme {programme.id}")

    # ------------------------------------------------------------------ directory and people

    def _people_and_directory(self):
        o = self.options
        self.program = Program.objects.create(
            name=PROGRAMME_NAME, short_name="SMMP", academic_year=str(self.today.year), is_demo=True,
            description="A sandbox programme with prepared data for presentations. Nothing here is real.",
        )
        admin_first, _, admin_last = o["admin_name"].partition(" ")
        self.admin = self._user(first=admin_first, last=admin_last or "Admin", role=Role.PROGRAM_ADMIN,
                                email=self._email(admin_first, admin_last, o["admin_email"]))
        Program.objects.filter(id=self.program.id).update(owner=self.admin, directory_reviewed_at=timezone.now(), directory_reviewed_by=self.admin)

        self.institutions = {
            "msn": Institution.objects.create(program=self.program, name="MentorMAMA School of Nursing", type="University", county="Kiambu",
                                                contact_person="Peter Njoroge", contact_email=f"nursing@{self.domain}", contact_phone="+254700000101"),
            "rosami": Institution.objects.create(program=self.program, name="Rosami College of Health Sciences", type="Medical training college", county="Nairobi",
                                               contact_person="Mercy Chebet", contact_email=f"registrar@{self.domain}", contact_phone="+254700000102"),
        }
        self.facilities = {
            "greenville": Facility.objects.create(program=self.program, name="Greenville Referral Hospital", county="Kiambu", level="Level 5",
                                             maternity_unit_name="Maternity Unit", contact_person="Grace Muthoni", contact_email=f"maternity.greenville@{self.domain}", contact_phone="+254700000201"),
            "lakeview": Facility.objects.create(program=self.program, name="Lakeview Maternity Hospital", county="Machakos", level="Level 5",
                                                maternity_unit_name="Maternity Unit", contact_person="David Mutua", contact_email=f"maternity.lakeview@{self.domain}", contact_phone="+254700000202"),
        }
        # Capacities leave room for a large next cohort, but not quite enough: the Antenatal and Theatre wards start small and
        # are enlarged after the first allocation run (see ``_next_cohort_stages``), so "retry unplaced" has something to do.
        wards = {"greenville": [("Labour Ward", 12, "Day, evening and night shifts"), ("Postnatal Ward", 8, "Day and night shifts"), ("Antenatal Ward", 3, "Day shift"),
                                ("Maternity Theatre", 2, "On call"), ("High Dependency Unit", 2, "Day and night shifts")],
                 "lakeview": [("Labour Ward", 8, "Day, evening and night shifts"), ("Postnatal Ward", 8, "Day and night shifts"), ("Antenatal Ward", 5, "Day shift")]}
        self.wards = {(fk, name): Ward.objects.create(facility=self.facilities[fk], name=name, max_students=cap, shift_pattern=shift)
                      for fk, rows in wards.items() for name, cap, shift in rows}

        self.coordinators = {key: self._user(first=first, last=last, role=Role.COORDINATOR, email=self._email(first, last), institution=self.institutions[key])
                             for first, last, key in COORDINATORS}
        self.managers = {key: self._user(first=first, last=last, role=Role.NURSE_MANAGER, email=self._email(first, last), facility=self.facilities[key])
                         for first, last, key in MANAGERS}
        for key, manager in self.managers.items():
            Ward.objects.filter(facility=self.facilities[key]).update(nurse_manager=manager)
        self.mentors = {}
        for first, last, key, profile in MENTORS:
            mentor = self._user(first=first, last=last, role=Role.MENTOR, email=self._email(first, last), facility=self.facilities[key])
            MentorProfile.objects.create(user=mentor, **profile)
            self.mentors[first] = mentor

        self.cohorts = {
            "msn": Cohort.objects.create(institution=self.institutions["msn"], name="BSc Midwifery Year 3, 2026 Intake A",
                                           start_date=self.today - dt.timedelta(days=130), end_date=self.today + dt.timedelta(days=120), planned_capacity=30),
            "rosami": Cohort.objects.create(institution=self.institutions["rosami"], name="Diploma in Midwifery, 2026 Block 2",
                                          start_date=self.today - dt.timedelta(days=110), end_date=self.today + dt.timedelta(days=110), planned_capacity=25),
        }
        self.students = {}
        courses = {"msn": "BSc Midwifery", "rosami": "Diploma in Midwifery"}
        for index, row in enumerate(STUDENTS, start=1):
            key, first, last, inst = row[:4]
            real = o["student_email"] if key == "faith" else ""
            name_first, name_last = (o["student_name"].partition(" ")[0], o["student_name"].partition(" ")[2] or last) if key == "faith" else (first, last)
            student = self._user(first=name_first, last=name_last, role=Role.STUDENT, email=self._email(first, last, real),
                                 institution=self.institutions[inst], reg=f"{'SN' if inst == 'msn' else 'MW'}{self.today.year}/{1000 + index}")
            StudentProfile.objects.create(student=student, course_name=courses[inst], year_of_study=3 if inst == "msn" else 2,
                                          emergency_contact_name=f"{self.rng.choice(['Susan', 'James', 'Ruth', 'Paul'])} {last}",
                                          emergency_contact_phone="+254700000999", emergency_contact_relationship=self.rng.choice(["Parent", "Sibling", "Guardian"]))
            CohortMembership.objects.create(cohort=self.cohorts[inst], student=student)
            self.students[key] = student
        self.template, _ = induction_services.ensure_default_template(self.program)
        self._admin_history()

    def _admin_history(self):
        """The Activity page shows what each person did, so give the administrator a real trail of programme setup."""
        scope = {"program_id": str(self.program.id)}

        def record(action, table, entity_id, changes=None):
            audit.record(actor=self.admin, action=action, entity_table=table, entity_id=entity_id, scope=scope, changes=changes)

        for institution in self.institutions.values():
            record("institution.created", "institutions_institution", institution.id)
        for facility in self.facilities.values():
            record("facility.created", "facilities_facility", facility.id)
        for ward in self.wards.values():
            record("ward.created", "facilities_ward", ward.id)
        for cohort in self.cohorts.values():
            record("cohort.created", "institutions_cohort", cohort.id)
        for user in User.objects.filter(program=self.program).exclude(id=self.admin.id):
            record("account.invited", "identity_user", user.id)

    # ------------------------------------------------------------------ learning

    def _training(self):
        self.modules = []
        for number, spec in enumerate(MODULES, start=1):
            module = TrainingModule.objects.create(
                program=self.program, title=spec["title"], slug=slugify(spec["title"]), description=spec["description"],
                pass_mark=spec["pass"], is_required=spec["required"], visible_roles=spec["roles"], category=spec["category"], certificate_enabled=True,
            )
            for position, (section, title, minutes, body) in enumerate(spec["lessons"], start=1):
                Lesson.objects.create(module=module, position=position, title=title, body=body, duration_minutes=minutes, section=section)
            quiz = Quiz.objects.create(module=module)
            for position, (prompt, options, correct, why) in enumerate(spec["questions"], start=1):
                QuizQuestion.objects.create(quiz=quiz, position=position, prompt=prompt, options=options, correct_option=correct, explanation=why)
            versioning.publish(module=module, user=self.admin)
            self.modules.append(module)
        # Some students have finished the shared modules.
        shared = {m.title: m for m in self.modules}
        for key in ("faith", "brian", "cynthia", "mercy", "dennis", "joy"):
            self._complete(shared["Respectful maternity care"], self.students[key], days_ago=self.rng.randint(10, 40), score=self.rng.randint(80, 100))
        for key in ("faith", "mercy"):
            self._complete(shared["Labour ward induction essentials"], self.students[key], days_ago=self.rng.randint(10, 30), score=self.rng.randint(85, 100))
        # Everyone has finished the required modules (so placements can start); two mentors have extra completions.
        required = [m for m in self.modules if m.is_required]
        for mentor in self.mentors.values():
            for module in required:
                if "mentor" in module.visible_roles:
                    self._complete(module, mentor, days_ago=self.rng.randint(20, 60), score=self.rng.randint(78, 100))
        for mentor_name in ("Esther", "Mary", "Lucy"):
            for module in self.modules:
                if not module.is_required and "mentor" in module.visible_roles:
                    self._complete(module, self.mentors[mentor_name], days_ago=self.rng.randint(5, 25), score=self.rng.randint(85, 100))

    def _complete(self, module, user, *, days_ago, score):
        attempt = QuizAttempt.objects.create(module=module, user=user, score=score, passed=True, answers={}, version=1)
        completion = ModuleCompletion.objects.create(module=module, user=user, attempt=attempt, score=score, version=1)
        when = timezone.now() - dt.timedelta(days=days_ago)
        QuizAttempt.objects.filter(id=attempt.id).update(created_at=when)
        ModuleCompletion.objects.filter(id=completion.id).update(completed_at=when, created_at=when)
        completion.completed_at = when
        certificates.issue_for_completion(completion)

    def _library(self):
        for title, kind, category, summary, tags, body in LIBRARY:
            ContentItem.objects.create(
                program=self.program, title=title, slug=slugify(title)[:200], summary=summary, body=body, content_type=kind, category=category,
                tags=tags, is_published=True, published_at=timezone.now() - dt.timedelta(days=self.rng.randint(5, 40)), created_by=self.admin,
                resource_url={"external": "https://www.who.int/health-topics/maternal-health" if "World Health" in title else "https://www.health.go.ke"}.get(kind, ""),
            )

    # ------------------------------------------------------------------ placements

    def _placements(self):
        self.placements = {}
        for row in STUDENTS:
            key, _first, _last, inst, scenario, ward_key, mentor_name, start_off, length, baseline, final, sessions = row
            if scenario == "enrolled":
                continue
            student = self.students[key]
            coordinator = self.coordinators[inst]
            start = self.today + dt.timedelta(days=start_off)
            end = start + dt.timedelta(days=length)
            placement = placement_services.create_placement(
                placement_services.CreatePlacement(cohort_id=self.cohorts[inst].id, student_id=student.id, planned_start=start, planned_end=end), actor=coordinator)
            self.placements[key] = placement
            if scenario == "draft":
                continue
            if scenario == "withdrawn":
                placement_services.transition(placement.id, State.WITHDRAWN, actor=coordinator, reason="student_withdrew")
                continue
            facility_key, ward_name = ward_key
            manager = self.managers[facility_key]
            mentor = self.mentors[mentor_name]
            placement_services.allocate_ward(placement.id, self.wards[ward_key].id, actor=manager)
            placement_services.assign_mentor(placement.id, mentor.id, actor=manager)
            if scenario == "scheduled":
                continue
            placement_services.transition(placement.id, State.AWAITING_STUDENT, actor=coordinator)
            if scenario == "awaiting":
                continue
            placement_services.confirm_student_placement(placement.id, student.full_name, actor=student)
            if baseline is not None:
                assessment_services.submit_baseline(placement.id, baseline, actor=student)
            if scenario == "orientation":
                continue
            induction_services.acknowledge_orientation(
                placement.id, actor=student, understands_placement_details=True, understands_emergency_process=True,
                understands_safeguarding=True, questions="Which shift will I start on, and who covers when my mentor is off?")
            checklist = induction_services.open_induction(placement.id, actor=mentor)
            items = list(TemplateItem.objects.filter(template=checklist.template).order_by("position"))
            notes = {8: f"First session agreed for {(start + dt.timedelta(days=2)):%A %d %B} at 08:00.", 7: "Objectives: partograph use, newborn care, respectful communication."}
            for item in items:
                induction_services.answer_item(checklist.id, item.id, "yes", actor=mentor, comment=notes.get(item.position))
            if scenario == "induction":
                continue
            induction_services.sign_induction(checklist.id, actor=mentor)
            self._backdate(placement, start, mentor)
            self._sessions(placement, mentor, sessions, start, end, scenario)
            if scenario == "paused":
                placement_services.pause(placement.id, actor=manager, reason="personal_family",
                                         note="Family bereavement. Student will resume after compassionate leave.", started_on=self.today - dt.timedelta(days=6))
            if scenario == "completed":
                self._complete_placement(placement, student, manager, final)
        # Samuel's required training lapses: shows the training gap on dashboards after the placements were arranged.
        ModuleCompletion.objects.filter(user=self.mentors["Samuel"], module__is_required=True, module__title="Respectful maternity care").delete()
        for key in self.placements:
            self.placements[key] = Placement.objects.get(id=self.placements[key].id)

    def _backdate(self, placement, start, mentor):
        Placement.objects.filter(id=placement.id).update(actual_start=start)
        when = timezone.make_aware(dt.datetime.combine(start, dt.time(8, 0)))
        StudentAssignment.objects.filter(placement=placement).update(started_on=start, started_at=when)
        MentorAssignment.objects.filter(placement=placement).update(started_at=when)
        WardAssignment.objects.filter(placement=placement).update(started_at=when)

    def _complete_placement(self, placement, student, manager, final):
        assessment_services.submit_final(
            assessment_services.FinalAssessment(placement_id=placement.id, confidence_score=final, overall_experience=5 if final > 80 else 4), actor=student)
        done = Placement.objects.get(id=placement.id)
        placement_services.transition(done.id, State.COMPLETED, actor=manager)
        Placement.objects.filter(id=placement.id).update(completed_at=timezone.make_aware(dt.datetime.combine(done.planned_end, dt.time(16, 0))))

    def _sessions(self, placement, mentor, count, start, end, scenario):
        if count <= 0:
            return
        assignment = MentorAssignment.objects.filter(placement=placement, ended_at=None).first()
        last = min(self.today - dt.timedelta(days=1), end) if scenario != "paused" else self.today - dt.timedelta(days=8)
        span = max(1, (last - start).days)
        for number in range(count):
            offset = round(span * (number + 0.5) / count) if number else min(1, span)
            when = start + dt.timedelta(days=min(offset, span))
            kind, topics, covered, feedback, follow = SESSION_PLAN[(number + placement.id.int % 3) % len(SESSION_PLAN)] if number else SESSION_PLAN[0]
            session = Session.objects.create(
                placement=placement, mentor_assignment=assignment, session_date=when, session_type=kind,
                duration_minutes=self.rng.choice([20, 25, 30, 35, 40, 45]), what_was_covered=covered, feedback_given=feedback,
                follow_up_action="" if follow == "none" else follow, created_by=mentor,
            )
            SessionTopic.objects.bulk_create([SessionTopic(session=session, topic=t) for t in topics])
            submitted = timezone.make_aware(dt.datetime.combine(when, dt.time(self.rng.choice([9, 11, 14, 16]), self.rng.randint(0, 59))))
            Session.objects.filter(id=session.id).update(submitted_at=submitted, created_at=submitted)
            # Older follow-ups were mostly dealt with; recent and every second old one stay pending, so the
            # mentor's Follow-ups page shows both lists.
            if follow != "none" and (self.today - when).days > 10 and number % 2 == 0:
                SessionFollowUp.objects.create(
                    session=session, outcome="done", resolved_by=mentor,
                    note="Covered on the next shift." if follow == "review_next_shift" else "",
                    resolved_at=submitted + dt.timedelta(days=2),
                )

    # ------------------------------------------------------------------ next cohorts (the allocation story)

    def _bulk_students(self, key, cohort, spec):
        """Create a cohort's students in a few queries: one password hash is reused, never one per person."""
        hashed = make_password(self.password)
        taken = set(User.objects.values_list("email", flat=True))
        rows, people = [], []
        for index in range(spec["students"]):
            first = FIRST_NAMES[(index * 7 + len(key)) % len(FIRST_NAMES)]
            last = LAST_NAMES[(index * 11 + 3 * len(key)) % len(LAST_NAMES)]
            email, suffix = self._email(first, last), 1
            while email in taken:
                suffix += 1
                email = self._email(f"{first}{suffix}", last)
            taken.add(email)
            rows.append(User(
                email=email, password=hashed, first_name=first, last_name=last, role=Role.STUDENT, status=Status.ACTIVE, program=self.program,
                institution_id=self.institutions[key].id, registration_number=f"{spec['reg']}{self.today.year}/{spec['reg_base'] + index}",
                phone=f"+2547{self.rng.randint(10000000, 99999999)}", email_verified_at=timezone.now(),
            ))
        people = User.objects.bulk_create(rows, batch_size=100)
        CohortMembership.objects.bulk_create([CohortMembership(cohort=cohort, student=person) for person in people])
        course = "BSc Midwifery" if key == "msn" else "Diploma in Midwifery"
        StudentProfile.objects.bulk_create([
            StudentProfile(student=person, course_name=course, year_of_study=3 if key == "msn" else 2, emergency_contact_name=f"{self.rng.choice(['Susan', 'James', 'Ruth', 'Paul'])} {person.last_name}",
                           emergency_contact_phone="+254700000999", emergency_contact_relationship=self.rng.choice(["Parent", "Sibling", "Guardian"]))
            for person in people
        ])
        return people

    def _placement_batch(self, coordinator, cohort, students, start, end, *, extra_ids=(), age_days=1):
        """Create the students' placements through a real placement batch, so Batch activity has history."""
        batch = PlacementBatch.objects.create(
            actor_id=coordinator.id, cohort_id=cohort.id, planned_start=start, planned_end=end,
            student_ids=[str(person.id) for person in students] + [str(value) for value in extra_ids],
        )
        run_placement_batch(batch)
        PlacementBatch.objects.filter(id=batch.id).update(created_at=timezone.now() - dt.timedelta(days=age_days))
        by_student = dict(StudentAssignment.objects.filter(placement_id__in=batch.created_placement_ids, ended_at=None).values_list("student_id", "placement_id"))
        return by_student

    def _backdate_requests(self, placement_ids, days):
        Placement.objects.filter(id__in=placement_ids).update(requested_at=timezone.now() - dt.timedelta(days=days))

    def _next_cohorts(self):
        """A big cohort at each school, left at different points of the pipeline (see the module docstring)."""
        for first, limit in MENTOR_LIMITS.items():
            User.objects.filter(id=self.mentors[first].id).update(max_active_placements=limit)
        self.next_cohorts = {}
        for key, spec in NEXT_COHORTS.items():
            start = self.today + dt.timedelta(days=spec["start_offset"])
            cohort = Cohort.objects.create(institution=self.institutions[key], name=spec["name"], start_date=start,
                                           end_date=start + dt.timedelta(days=PLACEMENT_LENGTH_DAYS + 90), planned_capacity=spec["planned_capacity"])
            audit.record(actor=self.admin, action="cohort.created", entity_table="institutions_cohort", entity_id=cohort.id, scope={"program_id": str(self.program.id)})
            self.next_cohorts[key] = {"cohort": cohort, "students": self._bulk_students(key, cohort, spec), "start": start, "end": start + dt.timedelta(days=PLACEMENT_LENGTH_DAYS)}
        self._next_cohort_stages_msn()
        self._next_cohort_stages_rosami()

    def _share_and_release(self, coordinator, arranged_rows, *, share, release):
        """Share the first ``share`` trained-mentor students with their students, and release the first ``release`` of those."""
        eligible = [row for row in arranged_rows if row.get("mentor") and row["mentor"].get("trained")]
        shared = [uuid.UUID(row["placement_id"]) for row in eligible[:share]]
        if shared:
            notices.share_with_students(actor=coordinator, placement_ids=shared)
        if release:
            planning.release_placements(actor=coordinator, placement_ids=shared[:release])
        return shared

    def _next_cohort_stages_msn(self):
        data = self.next_cohorts["msn"]
        people, cohort, start, end = data["students"], data["cohort"], data["start"], data["end"]
        peter, grace, david = self.coordinators["msn"], self.managers["greenville"], self.managers["lakeview"]
        # 4 not placed yet · 2 declined · 24 requested of Greenville and arranged by a run · 14 requested and waiting · 14 not yet requested
        not_placed, declined, run_block, pending, fresh = people[:4], people[4:6], people[6:30], people[30:44], people[44:58]
        tom = self.students["tom"]  # a student of the current cohort: shows a "not enrolled" skip in the batch result
        by_student = self._placement_batch(peter, cohort, [*declined, *run_block, *pending, *fresh], start, end, extra_ids=[tom.id], age_days=2)
        ids = lambda group: [by_student[person.id] for person in group]  # noqa: E731

        # Greenville is asked for the big block 3 days ago; its manager arranges it with one click.
        allocation.request_facility(actor=peter, placement_ids=ids(run_block), facility_id=self.facilities["greenville"].id)
        self._backdate_requests(ids(run_block), 3)
        # Lakeview was asked for two students and said no.
        allocation.request_facility(actor=peter, placement_ids=ids(declined), facility_id=self.facilities["lakeview"].id)
        allocation.decline_requests(actor=david, placement_ids=ids(declined), reason="Maternity unit is at capacity for these dates. Please ask another facility.")
        result = allocation.apply_auto_arrange(actor=grace, placement_ids=ids(run_block), strategy="balanced", seed="demorun1")
        AllocationRun.objects.filter(id=result["run_id"]).update(created_at=timezone.now() - dt.timedelta(hours=3))
        # Afterwards the hospital enlarges two wards, so retrying the unplaced students would now succeed.
        for ward_key, size in ((("greenville", "Antenatal Ward"), 8), (("greenville", "Maternity Theatre"), 4)):
            placement_services.update_programme_ward(actor=self.admin, ward_id=self.wards[ward_key].id, max_students=size)
        # A second block arrives later than the run, and is longer than what is left: the manager sees a capacity warning.
        allocation.request_facility(actor=peter, placement_ids=ids(pending), facility_id=self.facilities["greenville"].id)
        self._backdate_requests(ids(pending), 1)
        self._share_and_release(peter, result["arranged"], share=8, release=4)
        data.update(not_placed=not_placed, run_id=result["run_id"], pending=ids(pending), fresh=ids(fresh), run_block=ids(run_block))

    def _next_cohort_stages_rosami(self):
        data = self.next_cohorts["rosami"]
        people, cohort, start, end = data["students"], data["cohort"], data["start"], data["end"]
        mercy, david = self.coordinators["rosami"], self.managers["lakeview"]
        # 3 not placed yet · 12 requested of Lakeview and arranged · 6 requested and waiting · 4 not yet requested
        not_placed, run_block, pending, fresh = people[:3], people[3:15], people[15:21], people[21:25]
        by_student = self._placement_batch(mercy, cohort, [*run_block, *pending, *fresh], start, end, age_days=1)
        ids = lambda group: [by_student[person.id] for person in group]  # noqa: E731
        allocation.request_facility(actor=mercy, placement_ids=ids(run_block), facility_id=self.facilities["lakeview"].id)
        self._backdate_requests(ids(run_block), 2)
        result = allocation.apply_auto_arrange(actor=david, placement_ids=ids(run_block), strategy="balanced", seed="demorun2")
        AllocationRun.objects.filter(id=result["run_id"]).update(created_at=timezone.now() - dt.timedelta(hours=2))
        allocation.request_facility(actor=mercy, placement_ids=ids(pending), facility_id=self.facilities["lakeview"].id)
        self._backdate_requests(ids(pending), 1)
        self._share_and_release(mercy, result["arranged"], share=4, release=0)
        data.update(not_placed=not_placed, run_id=result["run_id"], pending=ids(pending), fresh=ids(fresh), run_block=ids(run_block))

    # ------------------------------------------------------------------ feedback and concerns

    def _feedback_and_concerns(self):
        def likert(code, value):
            return {"question_code": code, "scale": "likert_1_5", "value_numeric": value}

        feedback = [
            ("faith", [5, True, 4, 5, 4, 5], "My mentor explains things clearly and always checks that I understand before moving on.", False, "More time on the partograph before busy shifts would help."),
            ("brian", [4, True, 3, 4, 3, 5], "Supportive team. On some shifts my mentor is stretched across many students.", True, "A set time each shift to review what I have learned."),
            ("cynthia", [5, True, 5, 5, 5, 5], "I feel safe asking questions and trying new skills.", False, ""),
            ("kevin", [4, True, 4, 3, 4, 4], "Feedback is kind but sometimes comes late.", False, "Short feedback at the end of each shift."),
            ("joy", [5, True, 4, 5, 5, 5], "Very welcoming ward.", False, ""),
            ("peter", [3, True, 2, 3, 3, 4], "My mentor is often busy with emergencies and I wait a long time for supervision.", True, "A backup mentor when mine is unavailable."),
        ]
        for key, scores, comments, unresolved, improvement in feedback:
            orientation, knows, availability, constructive, confidence, respectful = scores
            assessment_services.submit_feedback(assessment_services.SubmitFeedback(
                placement_id=self.placements[key].id, mode="confidential", comments=comments, unresolved_concern=unresolved, improvement=improvement,
                responses=(likert("orientation", orientation), {"question_code": "knows_mentor", "scale": "yes_no", "value_boolean": knows},
                           likert("mentor_availability", availability), likert("constructive_feedback", constructive),
                           likert("confidence_this_week", confidence), likert("respectful_environment", respectful)),
            ), actor=self.students[key])
        ratings = {"faith": (5, 4, 5), "brian": (4, 4, 4), "lilian": (4, 5, 4), "cynthia": (5, 5, 5), "ann": (4, 3, 4), "kevin": (4, 4, 5)}
        for key, (support, learning, safety) in ratings.items():
            assessment_services.submit_anonymous_feedback(assessment_services.SubmitFeedback(
                placement_id=self.placements[key].id, mode="anonymous",
                responses=(likert("support", support), likert("learning_opportunities", learning), likert("safety_to_speak_up", safety)),
            ), actor=self.students[key], command_id=uuid.uuid4())

        RaiseConcern = safeguarding_services.RaiseConcern
        faith, brian, cynthia = (self.students[k] for k in ("faith", "brian", "cynthia"))
        greenville = self.managers["greenville"]
        # 1: fully handled, closed.
        row = safeguarding_services.raise_concern(RaiseConcern(
            placement_id=self.placements["faith"].id, facility_id=None, category="Wellbeing", severity="medium", routed_to="both",
            description="I was left to cover a busy bay without a clear handover and felt unsure what I was allowed to do. I would like clearer guidance for night shifts."), actor=faith)
        safeguarding_services.assign_reviewer(row.id, greenville.id, actor=greenville)
        safeguarding_services.record_finding(row.id, "Handover on that shift was incomplete. The student was working within supervision limits but was not told who to call.", actor=greenville)
        safeguarding_services.record_action(row.id, "Night-shift handover template introduced. Mentors briefed. Student now has a named contact for each shift.", actor=greenville,
                                            resolution_outcome=ResolutionOutcome.INTERNAL_ACTION)
        safeguarding_services.close(row.id, self.today - dt.timedelta(days=4), actor=greenville)
        # 2: under review.
        row = safeguarding_services.raise_concern(RaiseConcern(
            placement_id=self.placements["brian"].id, facility_id=None, category="Safety concern", severity="low", routed_to="nurse_manager",
            description="On two shifts the ratio of students to mentors on labour ward was too high for me to get hands-on supervision."), actor=brian)
        safeguarding_services.assign_reviewer(row.id, greenville.id, actor=greenville)
        # 3: open, high severity, both reviewers.
        safeguarding_services.raise_concern(RaiseConcern(
            placement_id=self.placements["cynthia"].id, facility_id=None, category="Professional conduct", severity="high", routed_to="both",
            description="A senior staff member spoke to me in a way that felt humiliating in front of a mother. I would like this looked at."), actor=cynthia)
        # 4: a mentor's facility-level concern.
        safeguarding_services.raise_concern(RaiseConcern(
            placement_id=None, facility_id=self.facilities["greenville"].id, category="Safety concern", severity="medium",
            description="Partograph forms keep running out on night shift, which makes teaching and monitoring harder. Requesting a stock check."), actor=self.mentors["Esther"])

    # ------------------------------------------------------------------ finish

    def _finish_people(self):
        logins = {Role.PROGRAM_ADMIN: self.admin, Role.COORDINATOR: self.coordinators["msn"], Role.NURSE_MANAGER: self.managers["greenville"],
                  Role.MENTOR: self.mentors["Esther"], Role.STUDENT: self.students["faith"]}
        Program.objects.filter(id=self.program.id).update(demo_logins={str(role): str(user.id) for role, user in logins.items()})
        for user in User.objects.filter(program=self.program):
            User.objects.filter(id=user.id).update(last_login=timezone.now() - dt.timedelta(hours=self.rng.randint(1, 72)))

    def _notifications(self, started):
        """Turn the events seeding produced into in-app notifications, without sending any email."""
        events = list(OutboxEvent.objects.filter(occurred_at__gte=started, dispatched_at=None).order_by("occurred_at"))
        for event in events:
            notification_services.create_for_event(event)
            OutboxEvent.objects.filter(id=event.id).update(dispatched_at=timezone.now(), attempts=1)
            notification_services.mark_delivered(event.id, emailed_user_ids=[])
        from apps.notifications.models import Notification

        recent = timezone.now() - dt.timedelta(days=2)
        Notification.objects.filter(event_id__in=[e.id for e in events], created_at__lt=recent).update(read_at=timezone.now())

    def _report(self):
        self.stdout.write(self.style.SUCCESS(f"Demo programme ready: {self.program.name}"))
        counts = {
            "people": User.objects.filter(program=self.program).count(),
            "placements": Placement.objects.filter(cohort__institution__program=self.program).count(),
            "sessions": Session.objects.filter(placement__cohort__institution__program=self.program).count(),
        }
        self.stdout.write("  " + ", ".join(f"{n} {k}" for k, n in counts.items()))
        self.stdout.write("  Real inboxes: " + (", ".join(a for a in (self.options["admin_email"], self.options["student_email"]) if a) or "none (all addresses are demo-only)"))
        self.stdout.write("  Turn on one-tap sign-in with DEMO_MODE=true and allow the real inboxes with DEMO_EMAIL_ALLOWLIST.")
