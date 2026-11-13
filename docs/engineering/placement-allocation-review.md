# Placement allocation: verification review

Reviewed on 2026-11-13 by reading the whole working-tree draft (`allocation.py`, `capacity.py`, `planning.py`,
`allocation_results.py`, `allocation_list.py`, `services.py`, `views.py`, `serializers.py`, `tasks.py`, migration
`placements.0013`, `seed_demo.py`) and running it. Every claim below names the function or test that proves it. Tests
were run only through `scripts/pytest-isolated.sh` (private databases); the development database was not touched.

Test files: `backend/tests/test_allocation_enhancements.py` (the draft's 43 tests, all still green) and
`backend/tests/test_allocation_review.py` (this review: 9 test cases, regressions + seed story + timings).

## 1. Verdict by requirement

Legend: **OK** correct as drafted · **FIXED** wrong, fixed here with a regression test · **GAP** works but with a stated limit.

| #   | Requirement                                                  | Verdict                                                                  | Evidence                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Capacity-aware across all shared facilities, wards and dates | **OK** (one limit, see R-1)                                              | `capacity.ward_loads`, `capacity.facility_capacity`, `services.ward_load`, `allocation.plan_auto_arrange`                                                                                                                                                                                                  |
| 2   | Overlap-aware occupancy                                      | **OK**                                                                   | `test_occupancy_is_overlap_aware_and_ignores_archived_wards_and_empty_facilities`, `test_ward_capacity_holds_under_concurrent_admission`                                                                                                                                                                   |
| 3   | Ward `max_students` is a hard cap                            | **OK**                                                                   | `test_sixty_students_are_arranged_correctly_within_budget` (no ward above capacity), `allocate_ward` re-counts under `lock_ward`                                                                                                                                                                           |
| 4   | Archived wards / facilities, facilities with no wards        | **OK** (+ a hand-placement hole closed in the draft)                     | same test; `test_an_archived_ward_cannot_be_chosen_by_hand`; "This facility has no active wards" reason in `plan_auto_arrange`                                                                                                                                                                             |
| 5   | Mentor workload limit and `accepting_students`               | **OK**                                                                   | `test_mentor_rules_are_respected_and_a_missing_mentor_is_an_issue_not_a_failure`, `test_two_managers_cannot_both_take_a_mentors_last_place` (`identity.lock_mentor`)                                                                                                                                       |
| 6   | Mentor training gate                                         | **FIXED**                                                                | the plan ignored `Program.require_mentor_training_before_placement`; `test_plan_does_not_call_a_mentor_untrained_when_the_programme_does_not_require_training`. Gate itself: `test_untrained_mentors_are_used_last_and_block_release_with_a_reason`                                                        |
| 7   | Mentor availability by date (leave, term time)               | **GAP**                                                                  | not modelled anywhere in the product (R-2)                                                                                                                                                                                                                                                                 |
| 8   | Fair, reproducible, balanced distribution                    | **OK**                                                                   | `test_same_seed_gives_the_same_arrangement_and_a_changed_world_is_refused`, `test_balancing_across_wards_and_mentors_is_even`, `test_arranging_a_large_cohort_is_fast_and_balanced[60/100]` (ward and mentor spread differ by at most 1)                                                                   |
| 9   | Timing for 60 and 100 students                               | **OK**                                                                   | measured, table in section 3                                                                                                                                                                                                                                                                               |
| 10  | Partial results with unplaced reasons                        | **OK**                                                                   | `test_unplaced_students_carry_reasons_and_can_be_retried_after_capacity_is_added`, `test_sixty_students_...` (4 unplaced at the split), seeded run `demorun1`                                                                                                                                              |
| 11  | Preview/apply parity (plan hash)                             | **OK** (one caller trap, see R-3)                                        | `test_sixty_students_...` (apply equals plan row for row), `test_facility_split_preview_matches_what_is_recorded_and_stale_hash_is_refused`, `test_same_seed_...`                                                                                                                                          |
| 12  | Undo                                                         | **OK**                                                                   | `test_undo_returns_students_to_the_queue_and_leaves_moved_on_students_alone`                                                                                                                                                                                                                               |
| 13  | Retry unplaced                                               | **OK**, replay **FIXED**                                                 | `test_unplaced_students_carry_reasons_...`; `test_replaying_a_retry_returns_the_real_result_not_an_empty_acknowledgement`                                                                                                                                                                                  |
| 14  | Idempotency                                                  | **OK** (replay bodies of some commands are only an acknowledgement, R-4) | `test_idempotent_replays_return_the_real_result`                                                                                                                                                                                                                                                           |
| 15  | Concurrency                                                  | **OK**                                                                   | `test_two_managers_cannot_both_take_a_mentors_last_place`, `test_ward_capacity_holds_under_concurrent_admission`, `test_a_student_already_arranged_by_someone_else_is_left_alone`, `test_one_students_unexpected_failure_does_not_abandon_the_others`; `_record_requests` locks rows in id order           |
| 16  | Student hold rules (no double booking)                       | **OK**                                                                   | `test_finished_placements_do_not_block_a_new_batch_but_live_ones_do`, `tests/test_placement_overlap.py` (all green); undo only moves DRAFT/SCHEDULED rows, whose hold is date-derived, so nothing to re-sync                                                                                               |
| 17  | Notifications                                                | **OK**                                                                   | `test_request_records_when_and_by_whom_and_notifies_the_facility_managers`, `test_arranged_notifications_count_each_school_separately`; arrangement uses `services.quiet_notifications()` so 60 students send one message per mentor and one per school, not 60                                            |
| 18  | Scope: coordinator never sees another institution            | **FIXED** (counts leaked)                                                | `test_a_coordinator_is_only_told_the_counts_for_their_own_students`, `test_a_coordinator_cannot_read_the_facility_split_of_another_school`, `test_run_result_is_scoped_for_coordinators_and_other_facilities`, `test_planning_is_scoped_to_the_coordinators_institution`                                   |
| 19  | Scope: manager sees only their own facility                  | **OK**                                                                   | `test_run_result_is_scoped_...` (other facility's manager gets 404), `allocation._facility_for`, `_run_for_actor`, `allocation_results._visible_run`                                                                                                                                                       |
| 20  | No N+1 queries                                               | **FIXED**                                                                | `PlacementSerializer` issued about six queries per placement; now fixed per list. `test_many_placements_serialise_in_a_fixed_number_of_queries_with_identical_output`, `test_planning_students_query_count_does_not_grow_with_the_cohort`, `test_allocation_list_query_count_does_not_scale_with_students` |
| 21  | Migration safe on populated data                             | **FIXED** (backfill was row by row)                                      | section 4                                                                                                                                                                                                                                                                                                  |

### What was already correct (draft verified, no change needed)

- One capacity rule (`ward_load` for hand placing under lock, `capacity.ward_loads` for planning) so preview and real action cannot disagree.
- Largest-remainder split in proportion to free places, never above them; no free place anywhere means nobody is requested (it does not fall back to an even split).
- Arrangement is planned in memory (15 or so queries, not per student), then applied through the ordinary `allocate_ward` / `assign_mentor` commands, each student under its own savepoint, with the placement locked and re-checked first.
- Mentor failure after a ward is granted keeps the ward and reports the mentor as an issue.
- `plan_hash` covers exactly who goes where; a changed world is refused (409) instead of applied.
- Scope is enforced by the query (`_scoped_placements`, `incoming`, `_visible_run`), and an unauthorised or foreign id is a 404, never a 403, so existence is not disclosed.
- Debugging leftovers: none (`print`, `breakpoint`, `TODO` searched across the changed files).

### What was fixed in this review (each with a regression test)

1. **Training flag ignored by the planner.** `plan_auto_arrange` always asked "has this mentor finished required modules?" even when the programme does not require training. Result: wrong "release will be blocked" warnings and a pointless preference for trained mentors. It now follows the same rule as release (`services.transition`, `planning._mentor_trained`).
2. **Coordinator saw other schools' totals.** An arrangement by one hospital can include several schools. `allocation.runs_for` reported the run's overall `arranged`/`unplaced`/`requested` to every coordinator involved. It now counts only that coordinator's own students (the run detail was already scoped).
3. **N+1 in `PlacementSerializer`.** Student, mentor, ward and ward occupancy were fetched per placement (plus lazy cohort/institution/facility). It hit `placements/batches` (up to 50 batches of 50+ students), `placements/incoming` and every list. A list serializer now loads everything in a fixed 9 queries with byte-identical output.
4. **Retry replay returned `{"replayed": true}`.** It now returns the stored result like auto-arrange does.
5. **Migration `0013` backfill** looped one UPDATE per request and skipped facility-split runs; now one set-based UPDATE and all runs are backfilled.
6. Additive API change: `placements/batches` gains `created_count`, `skipped_count` and `?summary=1` (leaves out each batch's placements) for the Batch activity list.

## 2. Mentor, student-hold and notification notes

- The planner fills mentors by (trained first, most places left, fewest planned this run). Ordering of mentors comes from `identity.active_mentors` which is ordered by name and email, so the same seed gives the same result between preview and apply.
- A mentor's workload counts every open placement regardless of dates (`identity._OPEN_ASSIGNMENT`). This is the same figure `assign_mentor` enforces, so plan and action agree, but it is conservative (R-2).
- Student holds: arranging never changes a student's dates. Hold rules apply when the placement is created (`bulk_create_placements`, `student_holds`); the planning list surfaces students who have none (`not_placed`).
- Release (`planning.release_placements`) goes through `services.transition`, so the training gate, ward and mentor checks and audit apply; it publishes the same `PlacementInvitationIssued` event as the single-placement release.

## 3. Measured timings (test database, one local machine, quiet)

| Case                                   | Plan (preview) | Apply (arrange) | Release all | Preview queries |
| -------------------------------------- | -------------- | --------------- | ----------- | --------------- |
| 60 students, 5 wards of 20, 10 mentors | 0.06 s         | 3.1 s           | 1.6 s       | 16              |
| 100 students, same                     | 0.07 s         | 5.5 s           | 2.8 s       | 16              |

Apply is linear at roughly 55 ms per student (each goes through the real guarded commands); preview is flat. A 100-student
apply is a 6 second request. Under load the same run measured 4.6 s and 8.1 s, so a worker timeout of 30 s is safe up to about 300 students in one request.

## 4. Migration `placements.0013`

Adds `Placement.requested_at` (null) and `AllocationRun.institution_ids` (default `[]`), then backfills. Checked on a scratch
database populated by the app itself: migrate forward, populate (9 requests, a split run and an arrangement), reverse to `0012`
(columns drop cleanly), forward again: all 9 `requested_at` values restored from `updated_at`, both runs' `institution_ids`
restored. `makemigrations --check --dry-run` reports no changes. The scratch database was dropped afterwards.

## 5. Seeded demo (seed_demo) results

`seed_demo` runs during Render deploys, so it was timed and checked in `test_seed_is_quick_sends_nothing_and_tells_the_allocation_story`.

| Measure         | Result                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Wall time       | 8.9 s quiet, 12 to 25 s while other suites ran on the same machine (limit asserted: 120 s)          |
| Queries         | about 8,040                                                                                         |
| Password hashes | 2 (the next-cohort students share one hash from a single `make_password`; limit asserted: under 60) |
| Users created   | 112 (99 students)                                                                                   |
| Email sent      | none (`mail.outbox == []`)                                                                          |

What a presenter sees, verified through the APIs in that test:

- **First school, "BSc Midwifery Year 3, 2026 Intake B" (58 students, starts in 14 days)**, overview counts: 4 not placed, 14 awaiting a facility request, 2 declined, 17 requested of a facility, 13 arranged, 4 shared with students, 4 released (awaiting student), 17 ready to release.
- **Second school, "Diploma in Midwifery, 2026 Block 3" (25 students)**: 3 not placed, 4 awaiting request, 6 requested, 8 arranged, 4 shared.
- **Incoming for the Greenville nurse manager** (`placements/incoming/summary`): 17 students requested against 7 free ward places and 10 mentor places, `over_capacity: true`, with two warnings. Lakeview's manager sees at least 6 incoming (asserted).
- **Recorded arrangement** `demorun1` (`placements/allocation-runs/<id>`): 24 requested, 21 placed, 3 unplaced with reason "Every ward is full for these dates."; the hospital then enlarged two wards, so `retry` places them (asserted). `demorun2` is the second school's.
- **Batch activity**: each coordinator has a completed batch (`placements/batches`), including a "not enrolled" skip.
- **Released and shared** placements have start and end dates.

Seed changes made in this review: none were needed to meet the brief; the draft's seed passed unchanged and `tests/test_demo.py` stays green.

## 6. Remaining items

| Id  | Severity | Item                                                                                                                                                                                                                                                                                                                                                           |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | Low      | Occupancy is counted per window ("anyone whose dates touch it"), not as peak concurrent load. Two students who never overlap each other but both overlap a third student's window count as two against a ward. It under-fills in rare staggered cases; it never over-fills. Same rule in `services.ward_load`, so plan and action agree.                       |
| R-2 | Medium   | Mentor availability is only "accepting students" and a workload count of all open placements. There is no leave or date availability, and a mentor whose placement ends before the new window still counts as full. Needs a product decision before building.                                                                                                  |
| R-3 | Medium   | `POST placements/facility-requests` with exactly one facility and no `expected_plan_hash` takes the old "ask this facility to host all of them" path and ignores capacity, so it can differ from a preview made with the same body. The screens must always send the previewed `seed` and `expected_plan_hash` (then capacity applies and parity is enforced). |
| R-4 | Low      | Replaying undo, decline, withdraw, share and release returns an acknowledgement or the current state, not the original body (arrange, retry and facility-request return the stored result). The screens should refetch after `idempotency_replayed: true`.                                                                                                     |
| R-5 | Low      | `placements/batches` still returns each batch's full placements unless `?summary=1` is sent (now a fixed 9 queries per batch).                                                                                                                                                                                                                                 |
| R-6 | Low      | Bulk placement creation of more than 50 students or "all eligible" is asynchronous (Celery worker `mentormama-worker` must be running). The response is 202 with a `batch_id`; poll `placements/batches/<id>`.                                                                                                                                                 |
| R-7 | Low      | Arrangement is one synchronous request (about 55 ms per student). Fine to a few hundred students; beyond that it should move to a task.                                                                                                                                                                                                                        |
| R-8 | Low      | Roles without a capability get 404 (`UnauthorizedFacilityAccess`), not 403, by design. Screens must treat 404 on these endpoints as "not available to you".                                                                                                                                                                                                    |

## 7. Decisions for the product owner

1. Should mentor availability include dates (leave, exam periods) and count only placements that overlap the new window (R-2)?
2. Should a single-facility request also be capacity-limited by default, with "ask this facility anyway" as an explicit choice (R-3)?
3. Should an over-capacity request be refused outright, or stay allowed with the warning (today: allowed, warned, and the manager decides)?
4. After a facility declines, should the coordinator be offered the capacity split again automatically for those students?
5. Undo window is 24 hours; is that right for a 60-student arrangement that students have already been shown?
6. Should "share with students" be required before "release", or remain optional?

## 8. Test results

See the final report; commands: `scripts/pytest-isolated.sh allocb apps tests -q` (full backend), `ruff check backend/apps backend/tests`, `python manage.py makemigrations --check --dry-run`.

---

# API CONTRACT

Every example below is a real response captured from the test database after `seed_demo` (Greenville Referral Hospital, Lakeview
Maternity Hospital, the two schools), then shortened: lists show one item, identifiers differ per run. Fields marked _additive_
were added by this work and never remove or rename an existing field.

## Conventions

- Base path `/api/v1/`. JSON in, JSON out. Session cookie auth plus header `X-Requested-With: mentormama` on unsafe methods (as the portal already does).
- **Every POST needs `Idempotency-Key: <uuid>`** (400 `IdempotencyKeyRequired` without it). Reusing a key replays the stored result; where the replay is only an acknowledgement the body is `{"replayed": true}` and `meta.idempotency_replayed` is `true`: refetch instead of reading the body (R-4).
- Success: `{"data": ...}` (optional `"meta"`). Error: `{"error": {"code", "message", "retryable", "details"}}`. Validation errors (400) also repeat the field errors at the top level and as `error.fields`.
- Error codes used by these endpoints:

| HTTP | `error.code`                                | Meaning                                                                                                                                                                                 |
| ---- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | `ValidationError`                           | bad parameter or body (`error.fields` names the field)                                                                                                                                  |
| 400  | `IdempotencyKeyRequired`                    | POST without `Idempotency-Key`                                                                                                                                                          |
| 401  | (framework)                                 | not signed in                                                                                                                                                                           |
| 404  | `UnauthorizedFacilityAccess` ("Not found.") | wrong role, other institution/facility, unknown id: deliberately indistinguishable                                                                                                      |
| 409  | `InvalidTransition`                         | a rule refused the action; `error.message` is written for the user. Also a stale `expected_plan_hash`, an unknown `status`/`sort` value, "nobody is waiting", "can no longer be undone" |

- Dates are ISO `YYYY-MM-DD`; timestamps ISO 8601 UTC.
- Roles: **C** coordinator (own institution), **NM** nurse manager (own facility), **PA** programme admin (whole programme). Planning endpoints take an optional `institution_id` that only a PA may use to narrow to one school.

### Pipeline status values (`status`, also the `status` filter)

In pipeline order, which is also the default sort. Each has a `status_label` and `next_action` in rows.

| code                                                     | label                       | meaning                                                                         |
| -------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------- |
| `not_placed`                                             | Not yet placed              | enrolled in the cohort, no placement created                                    |
| `not_requested`                                          | Awaiting a facility request | draft placement, no facility asked                                              |
| `declined`                                               | Declined by facility        | request declined; `declined{facility,reason,at}` is set                         |
| `requested`                                              | Requested of a facility     | in a facility's incoming queue (also students the facility could not place yet) |
| `partly_arranged`                                        | Partly arranged             | has a ward but the set is incomplete                                            |
| `arranged`                                               | Arranged                    | scheduled with ward and mentor, not yet shared                                  |
| `shared`                                                 | Shared with student         | arranged and the student has been emailed the provisional notice                |
| `released`                                               | Released, awaiting student  | invitation sent, student must confirm                                           |
| `confirmed`                                              | Confirmed, in induction     | orientation or induction                                                        |
| `active`, `paused`, `completed`, `withdrawn`, `archived` | as named                    |                                                                                 |

`ready_to_release` is true for a scheduled placement with ward, mentor and facility whose mentor has finished required training (when the programme requires it); otherwise `blockers[]` says why. `needs_attention` is true for `declined`, `partly_arranged`, `not_placed`, `not_requested`.

---

## C1. Planning overview

`GET /placements/planning/overview?institution_id=` (PA only for `institution_id`) · who: **C, PA** (others 404)

The next cohorts first (soonest start), then cohorts already under way; at most 6. `next_cohort_id` is the first upcoming one.

Response `200` (lists shortened to one item):

```json
{
  "data": {
    "today": "2026-11-13",
    "cohorts": [
      {
        "id": "a0e74f0d-20dc-46f8-8db5-78b4571ee9b3",
        "name": "BSc Midwifery Year 3, 2026 Intake B",
        "institution_id": "0ecf5c03-fc80-4129-8602-f099c9ae4598",
        "institution_name": "MentorMAMA School of Nursing",
        "start_date": "2026-11-27",
        "end_date": "2027-04-29",
        "planned_capacity": 60,
        "phase": "upcoming",
        "days_until_start": 14,
        "counts": {
          "not_placed": 4,
          "not_requested": 14,
          "declined": 2,
          "requested": 17,
          "partly_arranged": 0,
          "arranged": 13,
          "shared": 4,
          "released": 4,
          "confirmed": 0,
          "active": 0,
          "paused": 0,
          "completed": 0,
          "withdrawn": 0,
          "archived": 0,
          "total": 58,
          "ready_to_release": 17,
          "needs_attention": 20
        }
      }
    ],
    "next_cohort_id": "a0e74f0d-20dc-46f8-8db5-78b4571ee9b3",
    "statuses": [
      {
        "code": "not_placed",
        "label": "Not yet placed"
      }
    ]
  }
}
```

## C2. Cohort summary

`GET /placements/planning/cohorts/{cohort_id}?institution_id=` · who: **C, PA** · 404 for another institution's cohort or an unknown id.

Counts per status, the placement window and the free places in **every** shared facility for those dates. `window.basis` is `placements` (dates of the placements already made) or `cohort` (no placements yet, so the cohort dates). `capacity.shortfall` = students still needing a place beyond the free places. `facilities[].warnings` explains no wards, a queue longer than the room, or fewer mentor places than ward places.

Response `200` (lists shortened to one item):

```json
{
  "data": {
    "cohort": {
      "id": "a0e74f0d-20dc-46f8-8db5-78b4571ee9b3",
      "name": "BSc Midwifery Year 3, 2026 Intake B",
      "institution_id": "0ecf5c03-fc80-4129-8602-f099c9ae4598",
      "institution_name": "MentorMAMA School of Nursing",
      "start_date": "2026-11-27",
      "end_date": "2027-04-29",
      "planned_capacity": 60,
      "phase": "upcoming",
      "days_until_start": 14,
      "counts": {
        "not_placed": 4,
        "not_requested": 14,
        "declined": 2,
        "requested": 17,
        "partly_arranged": 0,
        "arranged": 13,
        "shared": 4,
        "released": 4,
        "confirmed": 0,
        "active": 0,
        "paused": 0,
        "completed": 0,
        "withdrawn": 0,
        "archived": 0,
        "total": 58,
        "ready_to_release": 17,
        "needs_attention": 20
      }
    },
    "window": {
      "start": "2026-11-27",
      "end": "2027-01-29",
      "basis": "placements"
    },
    "capacity": {
      "total_free": 11,
      "total_capacity": 55,
      "students_to_place": 20,
      "students_in_facility_queues": 17,
      "shortfall": 26,
      "facilities": [
        {
          "facility_id": "f484528b-19aa-40f5-915b-26ef25a3db05",
          "name": "Greenville Referral Hospital",
          "county": "Kiambu",
          "wards": [
            {
              "ward_id": "1e3e8f45-bc65-4044-a73a-87da45f04353",
              "name": "Antenatal Ward",
              "shift_pattern": "Day shift",
              "capacity": 8,
              "occupied": 3,
              "free": 5,
              "over_capacity": false
            }
          ],
          "capacity": 34,
          "occupied": 27,
          "free": 7,
          "pending_requests": 17,
          "mentors": {
            "mentors": 5,
            "accepting": 5,
            "remaining": 10,
            "at_limit": 1
          },
          "no_wards": false,
          "warnings": [
            "17 students are already requested for 7 free places on these dates."
          ]
        }
      ]
    },
    "warnings": [
      "37 students still need a place but the programme has 11 free places for 27 Nov to 29 Jan."
    ]
  }
}
```

## C3. Cohort students (the comprehensive per-student list)

`GET /placements/planning/cohorts/{cohort_id}/students` · who: **C, PA**

| Param               | Type                                                                           | Default  | Notes                                                                                |
| ------------------- | ------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------ |
| `status`            | comma list of status codes                                                     | all      | unknown value is 409 `InvalidTransition` ("Unknown status filter.")                  |
| `search`            | text (max 120)                                                                 |          | name, email or registration number, case-insensitive                                 |
| `facility_id`       | uuid                                                                           |          | placed in, or requested of, that facility                                            |
| `ready`             | bool                                                                           |          | `true` = ready to release only                                                       |
| `needs_attention`   | bool                                                                           |          |                                                                                      |
| `sort`              | `name`, `registration_number`, `status`, `start`, `facility`, `ward`, `mentor` | `status` | ties broken by name; empty values sort last                                          |
| `order`             | `asc`, `desc`                                                                  | `asc`    |                                                                                      |
| `page`, `page_size` | int ≥ 1, `page_size` ≤ 100                                                     | 1, 50    | `page_size=1000` is 400 `ValidationError`; a page past the end returns the last page |
| `ids_only`          | bool                                                                           | false    | returns only ids for "select all matching" (below)                                   |

`counts` always covers the **whole cohort**, not the filtered page, so the tabs keep their numbers while filtering.

Response `200` (lists shortened to one item):

```json
{
  "data": {
    "cohort": {
      "id": "a0e74f0d-20dc-46f8-8db5-78b4571ee9b3",
      "name": "BSc Midwifery Year 3, 2026 Intake B",
      "start_date": "2026-11-27",
      "end_date": "2027-04-29"
    },
    "counts": {
      "not_placed": 4,
      "not_requested": 14,
      "declined": 2,
      "requested": 17,
      "partly_arranged": 0,
      "arranged": 13,
      "shared": 4,
      "released": 4,
      "confirmed": 0,
      "active": 0,
      "paused": 0,
      "completed": 0,
      "withdrawn": 0,
      "archived": 0,
      "total": 58,
      "ready_to_release": 17,
      "needs_attention": 20
    },
    "results": [
      {
        "student": {
          "id": "72ecdff2-4eb5-4b7b-a775-57d67320cdac",
          "name": "Brenda Muriuki",
          "email": "brenda.muriuki@demo.sinapstechnology.tech",
          "registration_number": "SN2026/2014",
          "account_status": "active"
        },
        "placement_id": "0db856a3-c566-4935-9dd8-fc0825056846",
        "status": "released",
        "status_label": "Released, awaiting student",
        "next_action": "Waiting for the student to confirm",
        "state": "awaiting_student",
        "facility": {
          "id": "f484528b-19aa-40f5-915b-26ef25a3db05",
          "name": "Greenville Referral Hospital"
        },
        "requested_facility": {
          "id": "f484528b-19aa-40f5-915b-26ef25a3db05",
          "name": "Greenville Referral Hospital"
        },
        "requested_at": "2026-11-10T02:04:44.817574Z",
        "declined": null,
        "ward": {
          "id": "b8f3a627-bc32-4718-b659-abcbc440215c",
          "name": "Maternity Theatre"
        },
        "mentor": {
          "id": "289341f0-e5fe-4e22-960d-fefa248c565f",
          "name": "Agnes Wafula"
        },
        "planned_start": "2026-11-27",
        "planned_end": "2027-01-29",
        "shared_at": "2026-11-13T02:04:46.039037Z",
        "ready_to_release": false,
        "blockers": [],
        "needs_attention": false
      }
    ],
    "pagination": {
      "page": 1,
      "page_size": 2,
      "total_count": 8,
      "total_pages": 4,
      "has_next": true,
      "has_previous": false
    }
  }
}
```

`ids_only=true` (for "select all N matching" across pages):

Response `200` (lists shortened to one item):

```json
{
  "data": {
    "count": 14,
    "placement_ids": [
      "d077961c-7d93-451f-9b5b-76d60748a885",
      "5362413d-b96f-4ab1-b1d3-e7b4c1ed4698"
    ],
    "student_ids": [
      "815fd365-0a1f-4d0e-b9ca-41de1152f836",
      "be3410fd-5ab0-4956-bf6b-f02685322335"
    ],
    "without_placement_student_ids": []
  }
}
```

## C4. Release in bulk

`POST /placements/release` · who: **C, PA** · body: `placement_ids[]` (≤ 500) **or** `cohort_id` (one is required, else 400)

Moves arranged placements to "awaiting the student" and sends the invitation. Each student is independent: a failure never stops the others. Safe to repeat (already released are counted, not changed). Drafts are counted in `not_arranged`, not errors.

Request body:

```json
{
  "placement_ids": [
    "c902ea4c-4760-44d7-afcb-1c51f4489e23",
    "7d49ebb8-da39-445e-8dd6-ba38177b935c"
  ]
}
```

Response `200` (lists shortened to one item):

```json
{
  "data": {
    "released": 2,
    "already_released": 0,
    "not_arranged": 0,
    "blocked": [],
    "released_students": [
      {
        "placement_id": "7d49ebb8-da39-445e-8dd6-ba38177b935c",
        "student": "Dickson Chelimo"
      },
      {
        "placement_id": "c902ea4c-4760-44d7-afcb-1c51f4489e23",
        "student": "Amina Mburu"
      }
    ],
    "total": 2
  },
  "meta": {
    "idempotency_replayed": false
  }
}
```

`blocked[]` entries are `{placement_id, student, reason}` (for example "mentor has not finished required training"). Empty body: `400` `{"code": "ValidationError", "message": "Choose the students to release, or a cohort.", "fields": {"non_field_errors": ["Choose the students to release, or a cohort."]}}`

## C5. Request facilities: split preview and apply

`POST /placements/facility-requests` · who: **C, PA** · idempotent.

| Body field           | Notes                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `placement_ids[]`    | 1 to 500 draft, unrequested placements (others are listed in `skipped[]` with a reason)                                                             |
| `facility_ids[]`     | 1 to 20 active partner facilities of this programme (a foreign or archived one is 409)                                                              |
| `mode`               | `capacity` (default: share in proportion to free ward places, never above them; the rest are `unplaced`) or `even` (equal shares, facility decides) |
| `basis`              | `wards` (default) or `wards_and_mentors` (also capped by mentor places left)                                                                        |
| `net_of_pending`     | bool; also subtract students already requested of a facility                                                                                        |
| `seed`               | 4 to 40 letters/digits; omit for a new random one; **echo the previewed seed on apply**                                                             |
| `preview`            | `true` returns the plan and changes nothing                                                                                                         |
| `expected_plan_hash` | on apply: the previewed `plan_hash`; a mismatch is 409 "Things changed since you reviewed this split"                                               |

**Always send `seed` and `expected_plan_hash` when applying, including for a single facility** (R-3): without a hash a single facility is asked to host everyone, ignoring capacity.

Preview (`preview: true`):

Response `200` (lists shortened to one item):

```json
{
  "data": {
    "seed": "contract1",
    "mode": "capacity",
    "basis": "wards",
    "net_of_pending": false,
    "plan_hash": "55ccff7cb3372ce0cdc8af073f84b308d43531a507490d62e63de602fad48f4c",
    "facilities": [
      {
        "facility_id": "f484528b-19aa-40f5-915b-26ef25a3db05",
        "name": "Greenville Referral Hospital",
        "free_capacity": 7,
        "usable_capacity": 7,
        "requested": 4,
        "pending_requests": 17,
        "mentor_places_left": 10,
        "wards": [
          {
            "ward_id": "1e3e8f45-bc65-4044-a73a-87da45f04353",
            "name": "Antenatal Ward",
            "shift_pattern": "Day shift",
            "capacity": 8,
            "occupied": 3,
            "free": 5,
            "over_capacity": false
          }
        ]
      }
    ],
    "assignments": [
      {
        "placement_id": "5362413d-b96f-4ab1-b1d3-e7b4c1ed4698",
        "student": "Alice Cheruiyot",
        "facility_id": "f484528b-19aa-40f5-915b-26ef25a3db05"
      }
    ],
    "unplaced": [],
    "skipped": [],
    "warnings": [
      "Greenville Referral Hospital: 17 students are already requested for 7 free places on these dates."
    ],
    "window": {
      "start": "2026-11-27",
      "end": "2027-01-29"
    }
  }
}
```

Apply (`preview: false`, `expected_plan_hash` from the preview), `201`:

Response `201` (lists shortened to one item):

```json
{
  "data": {
    "requested": 6,
    "by_facility": {
      "f484528b-19aa-40f5-915b-26ef25a3db05": 4,
      "b632059b-23e1-4199-bb25-9e18fed9df43": 2
    },
    "unplaced": [],
    "skipped": [],
    "run_id": "73adf5e3-06b9-4757-ae6d-d2aa60323d65",
    "seed": "contract1"
  }
}
```

`unplaced[]` = `{placement_id, student, reason}` for students beyond the free places (nothing is requested for them). The facility's managers are notified once, with a count. The same data is stored as a run: read it back with C8/C9.

## C6. Withdraw and decline

`POST /placements/withdraw-requests` · who: **C, PA** · body `{"placement_ids": [...]}` · takes back requests the facility has not acted on; 409 if none qualify.

Response `200` (lists shortened to one item):

```json
{
  "data": {
    "withdrawn": 1
  }
}
```

`POST /placements/decline-requests` · who: **NM** · body `{"placement_ids": [...], "reason": "5 to 300 characters"}` · only from the manager's own incoming queue; the coordinator is notified once per school with the reason, and the students show as `declined` with `declined{facility,reason,at}`.

Response `200` (lists shortened to one item):

```json
{
  "data": {
    "declined": 1
  }
}
```

## N1. Incoming requests (list)

`GET /placements/incoming?facility_id=` · who: **NM** (own facility; `facility_id` only for PA) · coordinators get 404.

The raw placements waiting at the facility (full placement objects, the shape the existing list uses; now loaded in a fixed number of queries). Prefer N2 for the screen.

Response `200` (lists shortened to one item):

```json
{
  "data": [
    {
      "id": "9b827c00-39ca-40fe-98f4-27d44b54b589",
      "cohort_id": "a0e74f0d-20dc-46f8-8db5-78b4571ee9b3",
      "cohort_name": "BSc Midwifery Year 3, 2026 Intake B",
      "institution_id": "0ecf5c03-fc80-4129-8602-f099c9ae4598",
      "institution_name": "MentorMAMA School of Nursing",
      "facility_id": null,
      "facility_name": null,
      "requested_facility_id": "f484528b-19aa-40f5-915b-26ef25a3db05",
      "requested_facility_name": "Greenville Referral Hospital",
      "declined_facility_name": null,
      "decline_reason": "",
      "state": "draft",
      "planned_start": "2026-11-27",
      "planned_end": "2027-01-29",
      "actual_start": null,
      "actual_end": null,
      "withdrawal_reason": null,
      "completed_at": null,
      "archived_at": null,
      "version": 0,
      "active_mentor_id": null,
      "student": {
        "id": "65846145-4856-426e-a1da-906095f90095",
        "name": "Felista Ekiru",
        "email": "felista.ekiru@demo.sinapstechnology.tech",
        "registration_number": "SN2026/2011"
      },
      "mentor": null,
      "ward": null
    }
  ]
}
```

## N2. Incoming summary (the nurse manager's incoming page)

`GET /placements/incoming/summary?facility_id=` · who: **NM**, **PA** with `facility_id` · others 404.

Requests grouped by school, cohort and dates, each with the facility's room for those dates and a warning when the queue is longer than the room. Top-level `capacity` is for the whole queue's window; `over_capacity` is the headline flag; `latest_run` is the most recent arrangement (or `null`).

Response `200` (lists shortened to one item):

```json
{
  "data": {
    "facility_id": "f484528b-19aa-40f5-915b-26ef25a3db05",
    "total_requested": 21,
    "groups": [
      {
        "institution": {
          "id": "0ecf5c03-fc80-4129-8602-f099c9ae4598",
          "name": "MentorMAMA School of Nursing"
        },
        "cohort": {
          "id": "a0e74f0d-20dc-46f8-8db5-78b4571ee9b3",
          "name": "BSc Midwifery Year 3, 2026 Intake B"
        },
        "planned_start": "2026-11-27",
        "planned_end": "2027-01-29",
        "count": 21,
        "placement_ids": ["9b827c00-39ca-40fe-98f4-27d44b54b589"],
        "students": [
          {
            "placement_id": "9b827c00-39ca-40fe-98f4-27d44b54b589",
            "name": "Felista Ekiru",
            "registration_number": "SN2026/2011"
          }
        ],
        "requested_since": "2026-11-10T02:04:44.817574Z",
        "latest_request": "2026-11-13T02:04:50.428274Z",
        "capacity": {
          "free": 7,
          "capacity": 34,
          "occupied": 27,
          "wards": [
            {
              "ward_id": "1e3e8f45-bc65-4044-a73a-87da45f04353",
              "name": "Antenatal Ward",
              "shift_pattern": "Day shift",
              "capacity": 8,
              "occupied": 3,
              "free": 5,
              "over_capacity": false
            }
          ],
          "mentor_places_left": 10
        },
        "shortfall": 14,
        "over_capacity": true,
        "warnings": [
          "21 students are requested but only 7 ward places are free for these dates. 14 would stay unplaced."
        ]
      }
    ],
    "capacity": {
      "free": 7,
      "capacity": 34,
      "occupied": 27,
      "wards": [
        {
          "ward_id": "1e3e8f45-bc65-4044-a73a-87da45f04353",
          "name": "Antenatal Ward",
          "shift_pattern": "Day shift",
          "capacity": 8,
          "occupied": 3,
          "free": 5,
          "over_capacity": false
        }
      ],
      "mentors": {
        "mentors": 5,
        "accepting": 5,
        "remaining": 10,
        "at_limit": 1
      },
      "window": {
        "start": "2026-11-27",
        "end": "2027-01-29"
      }
    },
    "over_capacity": true,
    "latest_run": {
      "id": "735e6f54-d9a1-4c5a-9f0a-89230eef8db2",
      "mode": "auto_arrange",
      "created_at": "2026-11-12T23:04:45.982654Z",
      "by": "Grace Muthoni",
      "strategy": "balanced",
      "status": "partial",
      "facility_id": "f484528b-19aa-40f5-915b-26ef25a3db05",
      "facility_name": "Greenville Referral Hospital",
      "arranged": 21,
      "unplaced": 3,
      "requested": null,
      "can_undo": true,
      "can_retry": true
    }
  }
}
```

## N3. Auto-arrange: preview and apply

`POST /placements/auto-arrange` · who: **NM** (own facility), **PA** (`facility_id` required) · idempotent. Coordinators get 404: `404` `{"code": "UnauthorizedFacilityAccess", "message": "Not found.", "retryable": false, "details": {}}`

| Body field           | Notes                                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `facility_id`        | PA only                                                                                                                                                                                                           |
| `placement_ids[]`    | optional: only these incoming students (used by retry)                                                                                                                                                            |
| `strategy`           | `balanced` (default, emptiest ward by share of capacity) or `fill`                                                                                                                                                |
| `seed`               | 4 to 40 letters/digits; echo the previewed one on apply                                                                                                                                                           |
| `assign_mentors`     | default `true`; mentors are chosen trained-first, most places left                                                                                                                                                |
| `preview`            | `true` changes nothing                                                                                                                                                                                            |
| `expected_plan_hash` | on apply; a mismatch is 409: `409` `{"code": "InvalidTransition", "message": "Things changed since you reviewed this arrangement. Please review it again before confirming.", "retryable": false, "details": {}}` |

Preview, `200`:

Response `200` (lists shortened to one item):

```json
{
  "data": {
    "seed": "contract2",
    "strategy": "balanced",
    "facility_id": "f484528b-19aa-40f5-915b-26ef25a3db05",
    "facility_name": "Greenville Referral Hospital",
    "plan_hash": "0b6f19662f97721134280136a91f8d6ab6d07dd44f152f5d6eb764c8ce625bf1",
    "assignments": [
      {
        "placement_id": "e83190b1-9601-4582-9ea5-104b8b6abe60",
        "student": "Ibrahim Wafula",
        "registration_number": "SN2026/2040",
        "cohort": "BSc Midwifery Year 3, 2026 Intake B",
        "window": ["2026-11-27"],
        "ward": {
          "id": "1e3e8f45-bc65-4044-a73a-87da45f04353",
          "name": "Antenatal Ward"
        },
        "mentor": {
          "id": "ac4c2e75-8546-4a65-9171-aec0d2fff788",
          "name": "Esther Wanjiru",
          "trained": true
        },
        "issues": []
      }
    ],
    "unplaced": [
      {
        "placement_id": "472ca417-d446-4718-95d7-87e9fabfbade",
        "student": "Ronald Gitau",
        "registration_number": "SN2026/2034",
        "cohort": "BSc Midwifery Year 3, 2026 Intake B",
        "window": ["2026-11-27"],
        "ward": null,
        "mentor": null,
        "issues": [],
        "reason": "Every ward is full for these dates."
      }
    ],
    "summary": {
      "incoming": 21,
      "arranged": 7,
      "unplaced": 14,
      "with_mentor": 7,
      "wards": [
        {
          "id": "1e3e8f45-bc65-4044-a73a-87da45f04353",
          "name": "Antenatal Ward",
          "capacity": 8,
          "before": 3,
          "added": 5,
          "after": 8
        }
      ],
      "mentors": [
        {
          "id": "289341f0-e5fe-4e22-960d-fefa248c565f",
          "name": "Agnes Wafula",
          "assigned": 2,
          "remaining": 0,
          "limit": 8,
          "trained": true
        }
      ]
    }
  }
}
```

Apply, `201`. Students that could not be placed are in `unplaced[]` with a `reason`; a run is recorded either way (`status` `completed`, `partial` or `failed`):

Response `201` (lists shortened to one item):

```json
{
  "data": {
    "run_id": "20b4f8b7-3e78-4a6c-8a1c-bdc94dc42743",
    "seed": "contract2",
    "strategy": "balanced",
    "facility_id": "f484528b-19aa-40f5-915b-26ef25a3db05",
    "arranged": [
      {
        "placement_id": "e83190b1-9601-4582-9ea5-104b8b6abe60",
        "student": "Ibrahim Wafula",
        "registration_number": "SN2026/2040",
        "cohort": "BSc Midwifery Year 3, 2026 Intake B",
        "window": ["2026-11-27"],
        "ward": {
          "id": "1e3e8f45-bc65-4044-a73a-87da45f04353",
          "name": "Antenatal Ward"
        },
        "mentor": {
          "id": "ac4c2e75-8546-4a65-9171-aec0d2fff788",
          "name": "Esther Wanjiru",
          "trained": true
        },
        "issues": []
      }
    ],
    "unplaced": [
      {
        "placement_id": "472ca417-d446-4718-95d7-87e9fabfbade",
        "student": "Ronald Gitau",
        "registration_number": "SN2026/2034",
        "cohort": "BSc Midwifery Year 3, 2026 Intake B",
        "window": ["2026-11-27"],
        "ward": null,
        "mentor": null,
        "issues": [],
        "reason": "Every ward is full for these dates."
      }
    ],
    "summary": {
      "arranged": 7,
      "unplaced": 14,
      "mentors_notified": 4,
      "with_mentor": 7,
      "without_mentor": 0
    },
    "wards": [
      {
        "id": "1e3e8f45-bc65-4044-a73a-87da45f04353",
        "name": "Antenatal Ward",
        "capacity": 8,
        "before": 3,
        "added": 5,
        "after": 8
      }
    ],
    "mentors": [
      {
        "id": "ac4c2e75-8546-4a65-9171-aec0d2fff788",
        "name": "Esther Wanjiru",
        "assigned": 2,
        "limit": 12
      }
    ]
  }
}
```

Possible `issues[]`: mentor not finished training (release will be blocked), no mentor capacity left, mentor could not be assigned. Unplaced reasons: "Every ward is full for these dates.", "This facility has no active wards.", "Already arranged, or no longer requested of this facility, so it was left as it is.", or the rule that refused that student.

## R1. Allocation runs: list

`GET /placements/allocation-runs?limit=8&mode=` · who: **C, NM, PA**

`limit` 1 to 50 (default 8); `mode` `auto_arrange` or `facility_split`. **C** sees runs that concern their institution (both modes), with counts of **their own students only** and `can_undo`/`can_retry` always `false`. **NM** sees their facility's arrangements. **PA** sees the programme's arrangements.

Coordinator view:

Response `200` (lists shortened to one item):

```json
{
  "data": [
    {
      "id": "20b4f8b7-3e78-4a6c-8a1c-bdc94dc42743",
      "mode": "auto_arrange",
      "created_at": "2026-11-13T02:04:50.702349Z",
      "by": "Grace Muthoni",
      "strategy": "balanced",
      "status": "partial",
      "facility_id": "f484528b-19aa-40f5-915b-26ef25a3db05",
      "facility_name": "Greenville Referral Hospital",
      "arranged": 7,
      "unplaced": 14,
      "requested": null,
      "can_undo": false,
      "can_retry": false
    },
    {
      "id": "73adf5e3-06b9-4757-ae6d-d2aa60323d65",
      "mode": "facility_split",
      "created_at": "2026-11-13T02:04:50.440480Z",
      "by": "Peter Njoroge",
      "strategy": "capacity",
      "status": "completed",
      "facility_id": null,
      "facility_name": null,
      "arranged": 0,
      "unplaced": 0,
      "requested": 6,
      "can_undo": false,
      "can_retry": false
    }
  ]
}
```

`requested` is set for `facility_split` runs, `arranged`/`unplaced` for `auto_arrange` runs. `can_undo` is true for 24 hours while `status` is `completed` or `partial`; `can_retry` when something was left unplaced and has not been retried.

## R2. Allocation run: the result page

`GET /placements/allocation-runs/{run_id}?outcome=&search=&page=&page_size=` · who: **C** (only if the run concerns their institution), **NM** (own facility's arrangements), **PA** · anything else 404: `404` `{"code": "UnauthorizedFacilityAccess", "message": "Not found.", "retryable": false, "details": {}}`

`outcome` `placed`, `unplaced` or `requested`; `search` name or registration number; `page_size` ≤ 200 (default 100). `summary` always covers all rows (a filter never changes it). A **C** gets only their own students in `placements`, `summary` and `mentors`. Live facts (current ward/mentor/state) are re-read; `moved_since` is true when the student no longer matches what the run did. `downloads` tells the screen how to fetch the list (R4). `facilities` and `wards` give fill before and after (arrangements) or requests per facility (splits).

Nurse manager view of the unplaced students:

Response `200` (lists shortened to one item):

```json
{
  "data": {
    "run": {
      "id": "20b4f8b7-3e78-4a6c-8a1c-bdc94dc42743",
      "mode": "auto_arrange",
      "status": "partial",
      "strategy": "balanced",
      "seed": "contract2",
      "plan_hash": "0b6f19662f97721134280136a91f8d6ab6d07dd44f152f5d6eb764c8ce625bf1",
      "created_at": "2026-11-13T02:04:50.702349Z",
      "by": "Grace Muthoni",
      "facility": {
        "id": "f484528b-19aa-40f5-915b-26ef25a3db05",
        "name": "Greenville Referral Hospital"
      },
      "institution": null,
      "can_undo": true,
      "can_retry": true,
      "retried_by": null
    },
    "summary": {
      "requested": 21,
      "placed": 7,
      "unplaced": 14,
      "with_mentor": 7,
      "without_mentor": 0,
      "unplaced_reasons": [
        {
          "reason": "Every ward is full for these dates.",
          "count": 14
        }
      ]
    },
    "facilities": [
      {
        "facility_id": "f484528b-19aa-40f5-915b-26ef25a3db05",
        "name": "Greenville Referral Hospital",
        "capacity": 34,
        "before": 27,
        "added": 7,
        "after": 34,
        "free_after": 0
      }
    ],
    "wards": [
      {
        "id": "1e3e8f45-bc65-4044-a73a-87da45f04353",
        "name": "Antenatal Ward",
        "added": 5,
        "after": 8,
        "before": 3,
        "capacity": 8,
        "free_after": 0
      }
    ],
    "mentors": [
      {
        "id": "ac4c2e75-8546-4a65-9171-aec0d2fff788",
        "name": "Esther Wanjiru",
        "assigned_in_run": 2,
        "open_placements_now": 11,
        "limit": 12,
        "remaining_now": 1
      }
    ],
    "placements": [
      {
        "placement_id": "472ca417-d446-4718-95d7-87e9fabfbade",
        "student": "Ronald Gitau",
        "registration_number": "SN2026/2034",
        "cohort": "BSc Midwifery Year 3, 2026 Intake B",
        "outcome": "unplaced",
        "facility": {
          "id": "f484528b-19aa-40f5-915b-26ef25a3db05",
          "name": "Greenville Referral Hospital",
          "requested": true
        },
        "ward": null,
        "mentor": null,
        "planned_start": "2026-11-27",
        "planned_end": "2027-01-29",
        "state": "draft",
        "status": "requested",
        "status_label": "Requested of a facility",
        "reason": "Every ward is full for these dates.",
        "issues": [],
        "moved_since": false
      }
    ],
    "pagination": {
      "page": 1,
      "page_size": 2,
      "total_count": 14,
      "total_pages": 7,
      "has_next": true,
      "has_previous": false
    },
    "downloads": {
      "endpoint": "placements/allocation-list",
      "params": {
        "run_id": "20b4f8b7-3e78-4a6c-8a1c-bdc94dc42743"
      },
      "formats": ["csv"]
    },
    "detail_available": true
  }
}
```

## R3. Undo and retry

`POST /placements/allocation-runs/{run_id}/undo` · who: **NM** (own facility), **PA** · within 24 hours · body `{}`.

Puts students from that run back in the incoming queue, only those still exactly where the run left them; others are listed in `kept[]` (`{student, reason}`) and untouched. 409 if the run is too old, undone, or has nothing to undo.

Response `200` (lists shortened to one item):

```json
{
  "data": {
    "run_id": "20b4f8b7-3e78-4a6c-8a1c-bdc94dc42743",
    "reverted": 7,
    "kept": []
  }
}
```

`POST /placements/allocation-runs/{run_id}/retry` · who: **NM**, **PA** · body `{}` · `201`.

Tries again for the students the run left unplaced (new seed, same strategy), for example after wards or mentors were added. Returns a new run in the N3 apply shape and marks the old run `retried_by`. A replay with the same key returns the same body. 409 "Nobody was left unplaced in that run" or "Nobody is waiting".

Response `201` (lists shortened to one item):

```json
{
  "data": {
    "run_id": "094effce-505e-4571-befd-fa07211665b9",
    "seed": "fcbc879f4125",
    "strategy": "balanced",
    "facility_id": "f484528b-19aa-40f5-915b-26ef25a3db05",
    "arranged": [],
    "unplaced": [
      {
        "placement_id": "1c28eadb-10c4-4390-9829-ddc2ed544e67",
        "student": "Sharon Nyongesa",
        "registration_number": "SN2026/2027",
        "cohort": "BSc Midwifery Year 3, 2026 Intake B",
        "window": ["2026-11-27"],
        "ward": null,
        "mentor": null,
        "issues": [],
        "reason": "Every ward is full for these dates."
      }
    ],
    "summary": {
      "arranged": 0,
      "unplaced": 1,
      "mentors_notified": 0,
      "with_mentor": 0,
      "without_mentor": 0
    },
    "wards": [
      {
        "id": "1e3e8f45-bc65-4044-a73a-87da45f04353",
        "name": "Antenatal Ward",
        "capacity": 8,
        "before": 8,
        "added": 0,
        "after": 8
      }
    ],
    "mentors": []
  }
}
```

## R4. Allocation list download

`GET /placements/allocation-list?file=csv|xlsx|pdf&cohort_id=&run_id=` · who: **C, NM, PA** · returns a file, not JSON.

Rows the caller may see (a coordinator only their institution; a manager only their facility), optionally one cohort or the students of one run (`run_id` they may see, else 404). Invalid `file` is 409. Columns: Student, Registration number, Cohort, Facility, Ward, Mentor, Dates, Status. Each download is audited.

Captured CSV response:

```json
{
  "status": 200,
  "content_type": "text/csv; charset=utf-8",
  "disposition": "attachment; filename=\"mentormama-allocation-list-2026-11-13.csv\"",
  "head": [
    "\ufeffStudent,Registration number,Cohort,Facility,Ward,Mentor,Dates,Status",
    "Elijah Zulu,SN2026/2043,\"BSc Midwifery Year 3, 2026 Intake B\",Greenville Referral Hospital,Antenatal Ward,Hassan Omar,27 Nov 2026 \u2013 29 Jan 2027,Arranged",
    "Sharon Nyongesa,SN2026/2027,\"BSc Midwifery Year 3, 2026 Intake B\",Requested: Greenville Referral Hospital,,,27 Nov 2026 \u2013 29 Jan 2027,Requested of facility"
  ]
}
```

## B1. Batches (Batch activity page)

`GET /placements/batches?summary=1` · who: **C, PA** · lists the caller's own batches, newest first, at most 50. `GET /placements/batches/{batch_id}` returns one (404 if it is not the caller's).

`status` is `queued`, `processing`, `completed` or `failed`. Batches of more than 50 students (or "all eligible") are processed by the worker and the creating `POST /placements/bulk` returns `202`; poll the batch. _Additive:_ `created_count`, `skipped_count`, and `?summary=1`, which leaves `created` empty so the list stays small. `skipped[]` is `{reason, student_id}` with reasons such as `not_enrolled`.

Response `200` (lists shortened to one item):

```json
{
  "data": [
    {
      "batch_id": "7bf36be3-3d36-4dfc-b54f-1f65d18c6222",
      "status": "completed",
      "created": [
        {
          "id": "c21487cb-0825-4f9b-bf27-f48517754014",
          "cohort_id": "a0e74f0d-20dc-46f8-8db5-78b4571ee9b3",
          "cohort_name": "BSc Midwifery Year 3, 2026 Intake B",
          "institution_id": "0ecf5c03-fc80-4129-8602-f099c9ae4598",
          "institution_name": "MentorMAMA School of Nursing",
          "facility_id": null,
          "facility_name": null,
          "requested_facility_id": null,
          "requested_facility_name": null,
          "declined_facility_name": "Lakeview Maternity Hospital",
          "decline_reason": "Maternity unit is at capacity for these dates. Please ask another facility.",
          "state": "draft",
          "planned_start": "2026-11-27",
          "planned_end": "2027-01-29",
          "actual_start": null,
          "actual_end": null,
          "withdrawal_reason": null,
          "completed_at": null,
          "archived_at": null,
          "version": 0,
          "active_mentor_id": null,
          "student": {
            "id": "82ff6a0a-1832-4950-a0c0-ee26370e9560",
            "name": "George Macharia",
            "email": "george.macharia@demo.sinapstechnology.tech",
            "registration_number": "SN2026/2004"
          },
          "mentor": null,
          "ward": null
        }
      ],
      "created_count": 54,
      "skipped_count": 1,
      "skipped": [
        {
          "reason": "not_enrolled",
          "student_id": "2295cf2b-d0dc-4483-9ab6-1591dba4a725"
        }
      ],
      "error_message": "",
      "cohort_id": "a0e74f0d-20dc-46f8-8db5-78b4571ee9b3",
      "planned_start": "2026-11-27",
      "planned_end": "2027-01-29",
      "all_eligible": false,
      "created_at": "2026-11-11T02:04:44.788588+00:00"
    }
  ]
}
```

## Other behaviours the screens depend on

- **Wrong role / foreign id**: always 404 `UnauthorizedFacilityAccess` (no 403). Examples: student on planning, manager on planning, coordinator on incoming summary: `404` `{"code": "UnauthorizedFacilityAccess", "message": "Not found.", "retryable": false, "details": {}}`
- **Unknown cohort** `404`: `404` `{"code": "UnauthorizedFacilityAccess", "message": "Not found.", "retryable": false, "details": {}}`
- **Bad filter value** `409`: `409` `{"code": "InvalidTransition", "message": "Unknown status filter.", "retryable": false, "details": {}}`
- **Bad page size** `400`: `400` `{"code": "ValidationError", "message": "Page size: Ensure this value is less than or equal to 100.", "fields": {"page_size": ["Ensure this value is less than or equal to 100."]}}`
- **Missing key** `400`: `400` `{"code": "IdempotencyKeyRequired", "message": "Idempotency-Key header is required.", "retryable": false, "details": {}}`
- Changes to existing responses by this work: all additive. `PlacementSerializer` output is unchanged (verified identical); `placements/batches` gained `created_count`, `skipped_count`; `placements/allocation-runs` gained `limit`/`mode` params and per-institution counts for coordinators (values only differ when a run included other schools); retry replays now return the stored result.
