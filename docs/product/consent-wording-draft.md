# MentorMAMA consent wording — working draft v0.1

**Status:** DRAFT for enhancement. Not approved. Must be reviewed by the programme/ethics owner and the data-governance lead before any pilot data is collected (see `docs/OPEN-QUESTIONS.md` and `docs/product/stakeholder-decision-memo.md` §2–§3).
**Built:** consent capture exists (Admin → Consent): versioned wording, publish, per-person acceptance records, and a gate for students and mentors that is inert until a version is published. This text is the input for the final wording.
**How to read this:** text in `[square brackets]` is a placeholder the programme must supply. Lines marked **CONFIRM** depend on a decision not yet made. Nothing here is legal advice.

Sources used to keep the wording truthful to the system: `docs/product/stakeholder-decision-memo.md` (feedback visibility, anonymity limits, escalation access, small-ward caveat), `.sinaps/state.md` (feedback form, baseline/endline confidence, session log, mentor profile), `backend/apps/notifications/email.py` (what emails contain).

---

## 1. Principles the wording must keep

1. Say what is collected, who sees it, and why, in plain language at about reading age 12–14.
2. Never promise anonymity the numbers cannot deliver (small wards, one-student cohorts).
3. Keep **anonymous**, **confidential** and **safeguarding** separate and named exactly as the product names them.
4. Consent to _programme operation_ (placements, sessions, induction) is separate from consent to _research/evaluation use_. A person who declines research use can still take part in the programme **CONFIRM**.
5. Show the same text that was accepted: store the consent version and time, not just a tick.

---

## 2. Student consent (draft text)

### Title

**Before you start: how MentorMAMA uses your information**

### Short version (shown first)

MentorMAMA helps your university, your hospital and your mentor support you during your clinical placement. To do that we keep a record of your placement, your learning progress and the sessions with your mentor. You choose what is shared beyond that. You can read the full details below.

### What we collect

- **Your account:** name, email, registration number, university and cohort. [Add phone number only if used.]
- **Your placement:** the hospital, ward, mentor and dates you are assigned to, and your orientation and induction steps.
- **Your learning:** modules and quizzes you complete.
- **Your mentorship sessions:** the date, type, topics covered and follow-up your mentor records.
- **Your confidence ratings:** a short rating when you start and when you finish.
- **Your feedback:** the answers you give about your placement and mentor.
- **A concern you raise:** if you report a safeguarding concern.

### What we do not want

Please **never type patient names, hospital numbers or other details that could identify a patient** into any free-text box. Mentors are asked the same. If this happens by mistake, tell [contact] so it can be removed.

### Who can see what

| Information                      | Who can see it                                                                                                                                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account and placement details    | You; your university coordinator; the nurse manager at your hospital; your assigned mentor (only the details they need); programme administrators                                                                                                          |
| Mentorship session records       | You and your assigned mentor. Coordinators and nurse managers see that a session happened and its topics, **not** the free-text notes **CONFIRM**                                                                                                          |
| Confidence ratings               | You; [who else — **CONFIRM**]. Reported to the programme only as group results.                                                                                                                                                                            |
| Feedback marked **confidential** | The people your programme has authorised to review feedback for your placement. They can see it came from your placement. Your mentor does **not** see your individual answers.                                                                            |
| Feedback marked **anonymous**    | Not linked to you or your placement. It is grouped by cohort, hospital and ward. **If very few students are on a ward, a group result could point to one person. We hide group results shown to mentors until at least 3 people have answered. CONFIRM**   |
| A safeguarding concern           | Only the reviewer assigned to it, you (as the person who raised it) and the programme administrator. Every time it is opened is recorded. A person a concern is about can never review it. **A concern is not anonymous, so that it can be investigated.** |

### How we use it

- To run your placement: assign you a ward and mentor, remind you of next steps, and let staff see whether you are on track.
- To improve the programme: combined results (never your name) about how placements are working.
- [Research/evaluation — **CONFIRM** whether in scope: "With your separate permission, we may use de-identified results for [study name], approved by [ethics committee, reference]."]

### Emails and notifications

We send emails about your placement, such as your assignment, changes to it, and reminders. You can turn off optional updates in Settings. Security messages and messages you must act on cannot be turned off.

### How long we keep it

We keep your information for [retention period, e.g. the programme duration plus X years], then delete it or remove your identity from it. **CONFIRM** retention for escalation content (open question in `docs/OPEN-QUESTIONS.md`).

### Your choices and rights

- You can ask to see, correct or remove your information, and to withdraw research permission at any time, by contacting [name, email, phone]. [Add the rights language required by the applicable data-protection law, e.g. Kenya Data Protection Act 2019 — **legal review**.]
- Withdrawing research permission does not affect your place on the programme **CONFIRM**.
- Who is responsible for your data: [data controller] with [data processor/hosting]. Your data is stored in [country/region].

### What you are agreeing to (tick boxes — two separate)

1. ☐ I have read this and I understand how MentorMAMA uses my information to run my placement. _(Required to use MentorMAMA.)_
2. ☐ I agree that combined, de-identified results about my placement may be used for [evaluation/research]. _(Optional **CONFIRM**.)_

Footer shown after accepting: "Version [v1.0] accepted on [date]. You can read this again in Settings."

---

## 3. Mentor consent (draft text)

### Title

**Before you start: how MentorMAMA uses your information**

### What we collect

Your account and professional details (name, email, facility; and, if you choose, your cadre, department, years of practice, mentorship experience, CPD identifier and digital literacy), your training progress, the students assigned to you, the sessions you log, and any follow-up you request.

### Please remember

- Do not record patient-identifying details in session notes.
- Session notes are shared with the student and are not visible to coordinators or nurse managers **CONFIRM**.
- You will only see **combined** student feedback, and only when at least 3 students have answered. Individual feedback answers are not shown to you, and you must not try to work out who said what.

### Who can see what

| Information               | Who can see it                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| Your profile and workload | You; the nurse manager at your facility; programme administrators                              |
| Your training progress    | You; the nurse manager at your facility; programme administrators                              |
| Sessions you log          | You and the student; coordinators/nurse managers see session dates and topics only **CONFIRM** |
| Follow-up you request     | The nurse manager at your facility                                                             |

### Emails and notifications

We email you about new student assignments, changes to them, and reminders. You can turn off optional updates in Settings. Security messages cannot be turned off.

### How long we keep it, your rights, and contact

Same as the student text above: [retention], [rights/legal review], [contact].

### What you are agreeing to

1. ☐ I have read this and I understand how MentorMAMA uses my information. _(Required.)_
2. ☐ I agree that combined, de-identified results may be used for [evaluation/research]. _(Optional **CONFIRM**.)_

---

## 4. Coordinators and nurse managers (short notice, draft)

By signing in you agree to use student and mentor information only to run placements, to open records only when your role requires it, and never to copy it to personal devices or messaging apps. Exports (lists of students and allocations) contain personal data: store them securely and delete them when no longer needed. Every export and every opening of restricted content is logged.

---

## 5. Product requirements the wording implies (for the later build)

| Requirement                                                                                                    | Why                                                                          |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `ConsentRecord(user, document_type, version, accepted_at, research_opt_in)` and a gate before first data entry | Evidence of what was accepted and when                                       |
| Re-prompt when the version changes                                                                             | Wording will be enhanced later                                               |
| Settings page shows accepted version and lets a student withdraw research permission                           | Matches "withdraw at any time"                                               |
| Block mentors from seeing feedback aggregates under 3 responses                                                | Wording promises it **CONFIRM** that it is implemented as stated             |
| Allocation exports carry a handling notice and are logged                                                      | Section 4 wording                                                            |
| Emails never contain safeguarding or session free text                                                         | Matches the notifications section above (`docs/engineering/email-design.md`) |

## 6. Items to settle before this is final

| #   | Item                                                                                                                  | Owner                      |
| --- | --------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1   | Research/evaluation in scope for the pilot? Separate opt-in?                                                          | Programme lead, ethics     |
| 2   | Whether coordinators/nurse managers can read session free text when an escalation is open (already in OPEN-QUESTIONS) | Governance                 |
| 3   | Retention periods, including escalation content                                                                       | Governance, legal          |
| 4   | Applicable data-protection language, data controller and hosting location                                             | Legal                      |
| 5   | Minimum-response threshold of 3 for mentor-visible aggregates                                                         | Programme lead             |
| 6   | Whether anonymous feedback stays grouped by cohort/facility/ward                                                      | Programme lead, evaluation |
| 7   | Reading-level and translation (English/Kiswahili)                                                                     | Programme team             |
