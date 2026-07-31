# MentorMAMA — Stakeholder Decision Memo

**Decision request and outcome record**

| Field | Detail |
| --- | --- |
| To | Dr. Carolyne Kerubo Nyariki, JKUAT School of Nursing · AfyaVentures programme team · JHUB Africa |
| From | Sinaps Technology — Bouric Okwaro Enos (Ric), Co-Founder & Team Lead |
| Document type | Decision memo — product governance; outcome recorded |
| Date | 30 July 2026 |
| Response requested by | 13 August 2026 (10 working days) |
| Version | 1.0 |

---

## 1. Why You Are Receiving This

We have completed the design work that precedes coding: the business discovery, the domain model, the business
rules, and the step-by-step workflows. That work surfaced **eleven open decisions**. Eight of them are
engineering judgement calls and we have made them, with our reasoning recorded so you can overturn any of them.

**Three are not ours to make.** Two of those three block the pilot — not the code, the *pilot* — because they
determine what we must tell students and mentors before they submit a single response. The third determines a
database structure we would rather not rebuild after data exists.

This memo asks for those three, lists ten places where our design changed something the Concept Note said, and
tells you what we will do if we do not hear back.

**If we have no response by 13 August**, we will proceed on the recommendation stated for each item and record
it as a Sinaps decision rather than a stakeholder decision. That is a worse outcome for two of these three,
because they carry research-ethics and consent implications we are not the right people to settle.

---

## 2. Decision 1 — Who can see student feedback? *(Blocks the pilot)*

**Reference:** OD-03. Raised as an open decision in the Concept Note itself (§19).

### The question

A student submits feedback saying their mentor was unavailable, or that the learning environment did not feel
respectful. Who can read it?

Four candidate answers, with what each costs:

| Option | Consequence |
| --- | --- |
| Mentor sees individual responses | Students will not report honestly about the person supervising and assessing them. The feedback becomes worthless as a quality signal |
| Nurse Manager and Coordinator see individual responses; mentor sees nothing | Honest feedback, but the mentor never learns anything from it — which undercuts the capacity-building purpose of the product |
| **Nurse Manager and Coordinator see individual; mentor sees aggregates only, and only once at least 3 responses exist (recommended)** | Honest feedback, mentor still gets a signal they can act on, and no single student is identifiable |
| Nobody sees anything but aggregates | Safeguarding concerns hidden inside routine feedback would never reach a human |

### Why the threshold of 3 matters

"The mentor sees aggregate data only" sounds safe and is not. If a mentor has one student and that student
submits one response, the "aggregate" **is** that student's response, attributed by process of elimination. Any
system that shows a mentor an average of one thing has shown them an individual's answer.

We recommend suppressing mentor-visible aggregates until at least three responses exist, and displaying "not
enough responses yet" rather than an empty chart — because an empty chart still tells a mentor that a response
was submitted.

### What we need from you

1. Confirm the recommended option, or choose another.
2. Confirm the threshold of 3 is acceptable for the pilot's cohort sizes.
3. Confirm who drafts the consent wording that tells students this, and by when.

**This blocks the pilot** because the consent language depends on the answer, and consent must be in place
before the first response is collected — not before the first line of code.

---

## 3. Decision 2 — What does anonymous feedback attach to? *(Blocks the pilot)*

**Reference:** OD-06.

### The question

If a student submits feedback anonymously, what record does it belong to?

Here is the problem we found. The obvious implementation attaches the response to the student's *placement* and
omits their name. But a placement concerns **exactly one student** — so a response attached to a placement
identifies the student completely, name or no name. "Anonymous" feedback linked to a placement is not anonymous.

Our design therefore attaches anonymous responses to **Cohort + Facility + Ward** and stores no placement or
student reference at all. That is genuinely anonymous. It also means:

- Anonymous responses **cannot** be traced back to a placement for analysis.
- Anonymous responses **cannot** trigger follow-up with that student.
- If a ward has only one student from one cohort in a period, even this grouping narrows to one person. In a
  small pilot that is a realistic scenario.

### The trade-off you need to decide

| If you want | Then |
| --- | --- |
| Genuine anonymity | Accept that anonymous responses are analysable only at ward/cohort level, and cannot be followed up |
| Placement-level analysis of feedback | The mode must be called **confidential** (restricted access), not **anonymous**, and students must be told exactly that |
| Both | Not possible. This is a real constraint, not an implementation limitation |

Note this also affects the research evaluation: if the study needs to correlate feedback with individual
placement characteristics, an anonymous mode cannot supply that data.

### What we need from you

1. Confirm the anonymous mode is genuinely anonymous (our recommendation), **or** replace it with a clearly
   labelled confidential mode.
2. Confirm whether the research evaluation requires placement-level linkage of feedback. If it does, we need to
   know now.
3. Confirm the small-ward caveat is acceptable, and that consent wording will say so plainly rather than
   promising an anonymity the numbers cannot deliver.

A separate mechanism already exists for concerns needing follow-up: the escalation pathway, which is
**deliberately not anonymous** because an uninvestigable safeguarding report helps nobody. The interface will
state this before submission. Please confirm you are comfortable with that distinction.

---

## 4. Decision 3 — When a placement is paused, does the end date move? *(Blocks the database design)*

**Reference:** OD-01.

### The question

A student's placement runs 1 July to 1 September. On 15 July the ward closes for two weeks, or the student falls
ill. The placement is paused and resumes on 29 July.

Does the placement now end on **1 September** (calendar preserved, student gets two weeks less mentorship) or
**15 September** (mentorship time preserved, calendar extended)?

| Option | Consequence |
| --- | --- |
| **End date extends (recommended)** | The student receives their full intended mentorship time. Placement may run past the cohort's planned window and past the academic term |
| End date fixed | The calendar is predictable and cohort reporting is clean, but a paused student is quietly short-changed on supervision |

We recommend extending, and keeping the original dates recorded separately as *planned* start and end, so both
the intended and actual windows are reportable.

This is a genuine academic and regulatory question, not a technical one: it turns on whether the placement's
required duration is a *quantity of supervised practice* or a *period on the calendar*. You will know which
your accreditation treats it as; we do not.

### Why we need it before building the database

The answer determines whether placement dates are fixed values or mutable ones, and whether we store one pair
of dates or two. Changing that after real placements exist means a data migration on live pilot records.

**This blocks Stage 5 (database design), not the pilot.** We can continue with module architecture in the
meantime.

---

## 5. Ten Places Where Our Design Changed Something the Concept Note Said

None of these are defects in the Concept Note. They are the design sequence doing its job. We are listing them
so nothing is silently overridden — please flag anything you disagree with.

| # | Concept Note | Our design | Type | Needs your acknowledgement |
| --- | --- | --- | --- | --- |
| C-01 | CPD/Content Reviewer is an MVP role | Deferred to Phase 2 — it touches no part of the placement workflow, and the Note already defers regulator integration | Scope reduction | **Yes** |
| C-02 | Student profile holds their assigned mentor and placement dates | Those belong to the placement; a student has several placements over time | Structural only | No |
| C-03 | Feedback visibility is an open decision | See §2 | Decision | **Yes — blocks pilot** |
| C-04 | Induction checklist is completed when the student reports to the unit | Also a hard gate: no mentorship session can be logged until induction is complete | Strengthening | **Yes** — this can block a ward, deliberately |
| C-05 | Escalation access "restricted to authorised reviewers" | Only the assigned reviewer, the submitter, and the Programme Administrator can read the description; the subject of a concern can never review it; every read is logged | Strengthening | **Yes** — informs consent wording |
| C-06 | Offline support means draft-saving and retry sync | Retries can arrive hours later, after the placement has changed. Mentors will get a visible "unsynced logs" screen so nothing is silently lost | New requirement | **Yes** — small UI addition |
| C-07 | Dashboard indicators are stored metrics | Calculated on demand from the underlying records, so they can never disagree with the facts | Implementation only | No |
| C-08 | A ward has a maximum number of students | Enforced as a hard block on allocation, not a warning | Strengthening | **Yes** — confirm hard block is what you want |
| C-09 | "Escalation flag for serious concerns" | A full five-stage reviewed lifecycle with conflict-of-interest rules | Deeper than specified, given safeguarding stakes | **Yes** — acknowledge the added effort |
| C-10 | Capacity negotiation between coordinator and hospital | Stays an offline conversation for the MVP; we record the agreed number and build no workflow around it | Scope reduction | **Yes** — already recommended at Stage 1 |

---

## 6. Eight Decisions We Have Made

Recorded so you can overturn any of them. Full reasoning is in Stage 3 §13 and Stage 3.5 §12.

| ID | Decision | Our call |
| --- | --- | --- |
| OD-02 | Must a mentor finish required training before a placement is announced to the student? | Yes by default, with a programme-level setting and an Administrator override that records a reason. A mentor can still be *assigned* while training is outstanding, so wards are never stalled by paperwork |
| OD-04 | Is a Nurse Manager's boundary the facility or the ward? | The facility, with ward as a filter. At pilot scale they are the same set |
| OD-05 | How long after completion does a placement become read-only? | 30 days, configurable |
| OD-07 / OD-11 | Who may close a placement early, and does the university approve? | The Nurse Manager, with a recorded reason; the Coordinator is notified, not asked. Requiring cross-institution approval would stall closures indefinitely |
| OD-08 | Can a placement be completed while a concern is still open? | No by default. A low-severity concern may be deferred by explicit override with a reason; a high-severity one never can |
| OD-09 | What happens to an offline session log that no longer validates when it finally syncs? | Retained and shown to the mentor for resolution. Never silently discarded, and never accepted retroactively against a paused placement |
| OD-10 | Should a placement time out if the student never confirms it? | No. It is flagged for human follow-up. Auto-withdrawing a real placement because an email failed to arrive is the worse error |
| — | Are co-mentors supported (two mentors on one placement)? | Not in the MVP. Nothing in the source material establishes it, and the model preserves reassignment history without it. Straightforward to add later if wards actually work that way — **tell us if they do** |

---

## 7. One Risk We Cannot Engineer Away

The system will not collect patient-identifiable data: there is no field anywhere in it for a patient name, phone
number, or file number. That part is structural and we are confident in it.

What we cannot prevent is a mentor or student **typing** a patient's name into a free-text box — a session note,
a concern description. We mitigate it with an instruction at the point of entry and restricted access to those
fields, and reviewers can redact. But it is a residual risk, not a solved problem, and it should appear as such
in the data-governance sign-off rather than being described as prevented.

If your governance process needs a stronger control than instruction-plus-redaction, tell us now: options
include removing free text from the highest-risk fields altogether, or adding a pattern-based warning before
submission. Both cost usability on a form that must stay under three minutes.

---

## 8. What Happens Next

| Track | Status |
| --- | --- |
| Stage 4 — Module Architecture | Complete |
| Stage 5 — Database Architecture | Unblocked — OD-01 resolved |
| Consent wording & data-governance sign-off | The feedback decisions are resolved; formal consent and governance sign-off remain required before data collection |
| Pilot data collection | Blocked on consent sign-off |
| Stage 7 — UI/UX | Complete |

## 9. Decision Outcome — Dr. Carolyne Nyariki

Dr. Nyariki provided the following decisions in response to this memo. They are reflected in the Stage 3, 5,
6, and 7 design records.

| Decision | Confirmed outcome |
| --- | --- |
| **OD-03 — feedback visibility** | The University Coordinator and Ward Manager/In-charge may read individual feedback. Mentors see only aggregate feedback, and only when at least three submissions contribute to each displayed figure. |
| **Re-identification protection** | No mentor-visible aggregate may be broken down by sex, gender, or any other student attribute. Sex and gender are not collected in the MVP, so they cannot identify a respondent. |
| **OD-06 — feedback mode** | Confidential feedback is supported as the default. Students may choose genuine anonymous feedback where they need stronger protection; it is linked only to cohort, facility, and ward, never to a student or placement. The interface states that anonymous feedback cannot be followed up or analysed at placement level. |
| **OD-01 — placement interruption** | Each interruption records its start date, resumption date, and controlled reason. The placement records its eventual completion date separately, and `actual_end` extends by the interruption duration so the student does not lose supervised practice time. |

These decisions resolve the three questions in this memo. The remaining pilot gate is approval of the participant
consent wording and the data-governance sign-off, including the residual free-text patient-identifier risk.

---

*Prepared by Sinaps Technology for AfyaVentures / JHUB Africa / JKUAT School of Nursing. Confidential.*
