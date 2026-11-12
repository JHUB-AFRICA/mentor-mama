"""The enhanced labour-ward induction checklist (DRAFT for clinical review).

This is a *starting point* a Programme Administrator can load into the template
editor ("Start from the enhanced draft"). It is never published automatically and
it does not replace the concept-note default in ``services.DEFAULT_CHECKLIST_ITEMS``.

It is an ORIENTATION checklist: workflow, safety, reporting lines, emergency
arrangements, respectful maternity care, documentation and confidentiality, and
learning objectives. It deliberately contains no patient-specific clinical decisions
and no clinical protocols, and it carries the MentorMAMA principle that patient
identifiers are never recorded in the platform.

The sources and rationale for each item live in
``docs/product/induction-checklist-enhanced-draft.md``.
"""

from __future__ import annotations

TITLE = "Labour ward induction checklist (enhanced draft)"
NOTES = (
    "Draft for review by the clinical leads. Orientation only: it holds no patient-specific clinical "
    "decisions. Never record patient names, hospital numbers or other identifiers in MentorMAMA."
)

M = "mentor"
NM = "nurse_manager"
MN = "mentor_or_nurse_manager"
MS = "mentor_and_student"

# (label, completed_by_role, required, guidance, response_kind)
_Item = tuple[str, str, bool, str, str]
STD = "standard"
SCHEDULED = "scheduled_date"

_SECTIONS: tuple[tuple[str, tuple[_Item, ...]], ...] = (
    ("Welcome and introductions", (
        ("Student welcomed and introduced to the ward team, including the nurse manager and the shift lead.", MN, True,
         "Introduce the student by name and role. Point out who is in charge of each shift.", STD),
        ("Student told who their mentor is, who covers when the mentor is off duty, and how to reach them.", M, True,
         "Agree one back-up person. Share the ward contact method the student should use, not a personal number unless you choose to.", STD),
        ("Student shown the staff room, lockers, changing area and where to keep personal belongings safely.", M, False,
         "Mark as not applicable if the unit has no lockers.", STD),
    )),
    ("Ward layout, facilities and safety", (
        ("Walk-through of the ward completed: reception or triage, labour and delivery rooms, theatre, postnatal and newborn areas.", M, True,
         "Walk the route, do not just describe it. Note any areas a student must not enter alone.", STD),
        ("Fire exits, assembly point, fire alarm and extinguisher locations shown.", M, True,
         "Point to each exit and the assembly point. Ask the student to repeat the route back.", STD),
        ("Handwashing points and alcohol hand-rub locations shown, and the WHO 'My 5 Moments for Hand Hygiene' explained.", M, True,
         "Cover: before touching a woman or baby, before a clean or aseptic task, after body-fluid exposure, after touching a woman or baby, after touching their surroundings.", STD),
        ("Personal protective equipment (PPE) area shown, including what to wear for which tasks and how to put it on and take it off safely.", M, True,
         "Follow your facility's infection prevention and control (IPC) policy. Demonstrate, then watch the student do it.", STD),
        ("Safe handling of sharps explained, including never recapping needles by hand and where sharps containers are.", M, True,
         "Stress that the student reports any sharps incident straight away, without fear of blame.", STD),
        ("Needle-stick and splash exposure pathway explained: first aid, who to tell, where to report and how to be assessed.", MN, True,
         "Use your facility's written pathway. Check the student knows the out-of-hours route too.", STD),
        ("Waste segregation, spillage clean-up and linen handling explained, with the bins and colour codes pointed out.", M, True,
         "Follow the facility waste policy. Do not improvise.", STD),
    )),
    ("Reporting lines, shifts and who to call", (
        ("Shift times, handover times and break arrangements explained.", M, True,
         "Include what to do if the student cannot leave a task at break time.", STD),
        ("Reporting line explained: student, mentor, shift lead, nurse manager, then the university coordinator.", MN, True,
         "Say who the student should go to first for each kind of problem.", STD),
        ("Attendance rules explained: who to tell, and by when, if the student will be late or absent.", M, True,
         "Agree the method (phone call or message to the ward) and the deadline.", STD),
        ("Ward contact list shared: shift lead, duty doctor, senior midwife, security and switchboard.", M, True,
         "Use extension numbers. Do not write patient details anywhere on the list.", STD),
        ("Dress code, name badge, professional conduct and rules on using phones on the ward explained.", M, True,
         "Include the rule on photographs: no photographs of women, babies, records or screens.", STD),
    )),
    ("Emergency preparedness", (
        ("How to call for help shown: emergency bell or alarm, emergency phone number or extension, and who responds.", MN, True,
         "Have the student locate the alarm and say the number aloud. This is about raising the alarm, not clinical management.", STD),
        ("Location of emergency equipment shown (emergency trolley, oxygen, suction, resuscitation areas), with a reminder not to move or use it without supervision.", M, True,
         "Orientation only. Equipment checks and use are taught later under supervision.", STD),
        ("The student's role in an emergency explained: stay calm, call for help, follow instructions, stay within scope and make space.", M, True,
         "Make clear that a student asking for help early is always the right action.", STD),
        ("Where the unit's written emergency protocols are kept shown, and the student asked to read them with the mentor.", MN, True,
         "Point to the facility's own documents. This checklist does not contain clinical protocols.", STD),
        ("Emergency drill or simulation arrangements explained, including how the student can take part or observe.", NM, False,
         "Share the date of the next drill if one is planned.", STD),
    )),
    ("Respectful maternity care, privacy and consent", (
        ("Respectful maternity care expectations discussed: dignity, privacy, information, choice and freedom from harm and discrimination.", M, True,
         "Use the Universal Rights of Childbearing Women as the shared reference and give an example from this ward.", STD),
        ("Privacy arrangements explained: curtains, doors, who may be present and how people introduce themselves.", M, True,
         "Agree what the student does when privacy cannot be kept, for example by asking a senior colleague.", STD),
        ("Consent explained: the student introduces themselves as a student, asks permission to take part, and every woman may say no without any effect on her care.", M, True,
         "Practise the wording together.", STD),
        ("Companion of choice and visiting arrangements on this ward explained.", M, False,
         "Describe the ward policy. Mark as not applicable if the facility has none.", STD),
        ("Zero tolerance for disrespect or abuse explained, including how the student reports it and who will listen.", MN, True,
         "Make sure the student knows they will be supported for speaking up.", STD),
    )),
    ("Documentation, confidentiality and data protection", (
        ("Ward documentation expectations explained: what a student may write, what needs a registered professional's countersignature, and how entries are timed and signed.", M, True,
         "Use the facility's own record system. No patient details appear in this checklist.", STD),
        ("Confidentiality explained: no discussion of women or families in public areas or on social media or messaging apps.", M, True,
         "Link to the Kenya Data Protection Act 2019 and the facility's confidentiality policy.", STD),
        ("Student understands that no patient identifiers (names, hospital or ID numbers, phone numbers, photographs, bed or room details) are ever recorded in MentorMAMA.", MS, True,
         "Read this aloud together. MentorMAMA is for learning and mentorship, not patient records.", STD),
        ("Student shown how to describe a learning experience without identifying anyone, for example 'a woman in early labour' with no names, dates of birth or bed numbers.", M, True,
         "Practise by turning one real learning moment into an anonymous reflection.", STD),
        ("What to do if a record is lost or information is shared by mistake explained: tell the shift lead straight away.", MN, True,
         "Reinforce that early reporting protects everyone.", STD),
    )),
    ("Scope of practice, supervision and learning plan", (
        ("Student's scope of practice and supervision level explained: observe, assist, or practise under direct supervision, and never work alone.", M, True,
         "Use your university's wording for supervision levels.", STD),
        ("Student told to say so if asked to do something outside their training or scope, and who to ask instead.", M, True,
         "Make 'I have not done this before' an accepted thing to say.", STD),
        ("Student learning objectives discussed and recorded.", MS, True,
         "Ask what the student wants to learn and compare with the university's placement outcomes.", STD),
        ("Skills and competencies to practise during the placement identified with the student, using the university logbook.", MS, False,
         "Refer to the programme competency framework. Do not list individual patients.", STD),
        ("How feedback works explained: informal feedback after shifts, a mid-placement review and the final assessment.", MS, True,
         "Agree when and how the student can ask for feedback.", STD),
        ("First mentorship session scheduled. Add the agreed date and time.", MS, True,
         "Choose a time in the first week.", SCHEDULED),
    )),
    ("Wellbeing, support and raising concerns", (
        ("Student told how to get support after a distressing event: talk to the mentor or shift lead, take a break and use debrief or counselling services.", M, True,
         "Say that feeling upset after a difficult birth or loss is normal.", STD),
        ("Occupational health explained: how to access it and who to tell if health needs affect work. No medical details are asked for here.", M, False,
         "Point to the process only. Do not record any health information in MentorMAMA.", STD),
        ("How to raise a concern explained: the ward route (mentor, shift lead, nurse manager), the university route and the MentorMAMA concern route, with no penalty for raising one in good faith.", MN, True,
         "Show where the concern option is in MentorMAMA. Do not include patient identifiers in a concern.", STD),
        ("How to give feedback on the placement explained, including the confidential and anonymous options in MentorMAMA.", M, True,
         "Say that feedback is welcome and will not affect the student's assessment.", STD),
    )),
)


def enhanced_items() -> list[dict]:
    """Flatten the draft into editor-ready item dictionaries (position starts at 1)."""
    items: list[dict] = []
    for section, rows in _SECTIONS:
        for label, role, required, guidance, kind in rows:
            items.append({
                "section": section, "label": label, "completed_by_role": role,
                "is_required": required, "guidance": guidance, "response_kind": kind,
            })
    return items


#: The same content as a single constant, for callers that want the whole template.
ENHANCED_LABOUR_WARD_CHECKLIST: dict = {
    "title": TITLE,
    "notes": NOTES,
    "items": enhanced_items(),
}
