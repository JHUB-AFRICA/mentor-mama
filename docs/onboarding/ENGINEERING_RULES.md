# MentorMAMA — Engineering Rules

**The rules that make the architecture hold. Read this before your first pull request.**

These are not style preferences. Each one exists because breaking it would undo a decision made in the design
sequence (Stages 1–6), and most of them are enforced by CI rather than by review. Where a rule has an
identifier — `MA-01`, `INV-05`, `POL-014` — that is the rule it protects; the reasoning lives in
`docs/architecture/`.

The single sentence the whole document reduces to:

> **The database enforces the rules, services decide, modules stay strangers, and nothing is trusted from the
> client.**

---

## 1. Module Boundaries

### 1.1 A module's internals are private

Each Django app exposes exactly three importable modules:

| File | Contains |
| --- | --- |
| `api.py` | Functions other modules may call. Returns **value objects / dataclasses**, never ORM instances |
| `events.py` | Domain event definitions this module publishes |
| `ports.py` | Protocols this module defines for a **higher** layer to implement (§1.3). A port exists to be implemented elsewhere, so it must be importable |

Everything else — `models.py`, `services.py`, `state_machine.py`, `selectors.py`, `serializers.py`, `views.py` —
is private to the app.

```python
# ✅ correct
from apps.placements import api as placements
if not placements.is_active(placement_id):
    raise PlacementNotActive

# ❌ forbidden — reaches into another module's internals (MA-11)
from apps.placements.models import Placement
from apps.placements.services import complete_placement
```

**Why `api.py` returns value objects and not model instances:** an ORM instance carries `.save()`. Handing one
across a boundary hands over the ability to write to tables you do not own, and the caller will eventually use
it — usually at 5pm on a Friday.

### 1.2 Dependencies point downward only

```
Layer 5   analytics · notifications          ← leaves: nothing may import these
Layer 3   induction · mentorship · assessments · safeguarding
Layer 2   placements                         ← core domain
Layer 1   institutions · facilities · learning · content
Layer 0   identity · core                    ← platform: import from anywhere
```

| Rule | Statement |
| --- | --- |
| MA-01 | Import from a **lower** layer only. Never upward, never sideways |
| MA-02 | `analytics` and `notifications` are leaves. They learn about the world only from events |
| MA-04 | Two modules in the same layer never import each other. `mentorship` must not know `safeguarding` exists |
| MA-05 | If a lower module needs something from a higher one, invert the dependency (§1.3). Never import upward |

Enforced by `import-linter` in CI (`.importlinter`). A violating PR fails before review.

### 1.3 When you need something from a higher layer, define a port

`placements` (layer 2) must know whether an escalation is open (owned by `safeguarding`, layer 3) before it
allows completion. It does **not** import `safeguarding`.

```python
# apps/placements/ports.py — owned by placements
class CompletionBlocker(Protocol):
    name: str
    def blocks(self, placement_id: UUID) -> BlockReason | None: ...

# apps/safeguarding/apps.py — safeguarding depends on placements, not the reverse
def ready(self):
    from apps.placements import api as placements
    placements.register_completion_blocker(OpenEscalationBlocker())
```

Adding a new blocker requires **no change to `placements`**. If your change to a lower module requires editing
that module to accommodate a higher one, the dependency is pointing the wrong way.

### 1.4 Foreign keys across modules

**A foreign key is a dependency the database enforces, so it obeys the same direction rule as an import.**

| Rule | Statement |
| --- | --- |
| MA-12 | A cross-module FK is permitted **only when the target is in a lower layer** (or the same module). Declared by string reference: `ForeignKey("placements.Placement", ...)` |
| MA-12a | **Upward or sideways relations use a bare `UUIDField`, never an FK** — validated on write through the owning module's `api.py`. An upward FK is a coupling `import-linter` cannot see, because the relation is a string |
| MA-12b | **Leaf modules (`analytics`, `notifications`) hold bare identifiers**, never FKs into domain tables. Projections must stay truncatable and rebuildable without touching the domain (MA-06) |
| MA-12c | Every cross-module FK is `on_delete=PROTECT`. Nothing cascades: cascade delete and INV-10 are incompatible |

`tests/test_module_boundaries.py` enforces all four, and prints the full inventory of cross-module foreign keys
so the coupling extraction would have to pay for (Stage 4 §7.5) is a known list rather than a discovery.

#### Why FKs rather than bare UUIDs everywhere

This was stress-tested rather than assumed — see `tests/test_fk_stress.py`, which is worth reading before
proposing a change here.

The `mentorship_session_window` trigger enforces INV-04 and INV-05 by reading the parent placement:
`SELECT ... INTO p ... WHERE id = NEW.placement_id`. If no row matches, `p.state` is NULL, and
`NULL <> 'active'` evaluates to NULL — which is not true — so **every guard in the trigger silently passes**.
Without the foreign key, a session carrying a bogus `placement_id` would be written with the
active-placement and date-window rules unenforced.

So the principle is not "FKs are tidy". It is:

> **Use a foreign key wherever its absence fails _open_. A bare identifier is acceptable where its absence fails
> _closed_.**

`identity.User.institution_id` and `facility_id` are bare UUIDs for exactly that reason: an FK there would point
upward (layer 0 → layer 1), and a dangling scope id fails closed, because `selectors.in_scope` filters on it and
a bad value returns no rows rather than another tenant's.

---

## 2. Where Logic Lives

### 2.1 All business logic lives in services

```
views.py        HTTP only: parse, delegate, serialise, map errors. No business rules.
serializers.py  Shape and field-level validation only. No cross-record rules, no queries.
services.py     Business logic. Owns transactions. The only place that writes.
selectors.py    Read queries. Returns data. Never writes.
models.py       Structure, constraints, and only invariants a single row can express.
state_machine.py  Transition table and guards (placements only).
```

**Views are thin. Models are thin. Services are where the product lives.**

```python
# ❌ business logic in a view
class LogSessionView(APIView):
    def post(self, request, placement_id):
        placement = Placement.objects.get(id=placement_id)
        if placement.state != "active":
            return Response({"error": "not active"}, status=409)
        Session.objects.create(...)

# ✅ view delegates; service decides
class LogSessionView(APIView):
    def post(self, request, placement_id):
        cmd = LogSessionCommand(**serializer.validated_data)
        session = mentorship_services.log_session(cmd, actor=request.user)
        return Response(SessionSerializer(session).data)
```

### 2.2 No business logic in model methods, signals, or `save()`

- **No `save()` overrides** that do more than set a derived field on the same row.
- **No Django signals for domain logic.** `post_save` handlers are invisible control flow — they fire on
  fixtures, on bulk operations, on migrations, and they make transaction boundaries unknowable. The event
  mechanism is the outbox (§4), not signals.
- **No `Model.objects.create()` from a view.** Writes go through a service.
- **No property that queries.** A property that issues SQL turns a loop into an N+1 and hides it behind a dot.

### 2.3 No fat managers holding domain rules

Custom managers/querysets are for **reusable query fragments** (`.active()`, `.in_scope(scope)`), not for
decisions. A manager method that raises a domain error is a service in the wrong file.

---

## 3. The Database Is the Last Line of Defence

12 of 18 invariants are enforced by constraints, indexes and triggers (Stage 5 §7). Consequences for how you
write code:

| Rule | Statement |
| --- | --- |
| DB-01 | **Never catch `IntegrityError` and pass.** Translate it to the domain error code (Stage 6 §6.2) or let it raise. A swallowed constraint is worse than no constraint — everyone believes the rule holds |
| DB-02 | Raw SQL for triggers, partial/functional indexes and `EXCLUDE` constraints goes in a `NNNN_constraints.py` migration with a tested `reverse_sql` |
| DB-03 | Every state transition takes `select_for_update()` on the aggregate row, and **re-checks its guards under the lock** |
| DB-04 | No `bulk_create`/`bulk_update`/`.update()` on operational tables — they skip validation, skip audit, and skip the outbox. Loops are fine at pilot scale |
| DB-05 | Never `delete()` operational data. Set `archived_at` (INV-10) |
| DB-06 | Migrations are additive and reversible. No data loss in a migration without an explicit, reviewed decision |
| DB-07 | `makemigrations --check --dry-run` must be clean. Models and migrations never drift |

### 3.1 Transactions

```python
# ✅ the shape every command follows
with transaction.atomic():
    placement = Placement.objects.select_for_update().get(id=cmd.placement_id)  # lock
    _check_guards(placement, cmd)                                              # under lock
    session = Session.objects.create(...)                                      # write
    audit.record(actor, "session.log", session)                                # audit
    outbox.publish(SessionLogged(...))                                         # event row
# side effects happen after commit, driven by the outbox worker
```

| Rule | Statement |
| --- | --- |
| TX-01 | **No external I/O inside `transaction.atomic()`** — no email, no HTTP, no file generation, no SMS. Enforced by a test fixture (MA-13) |
| TX-02 | One command, one transaction. Do not wrap two commands in one atomic block to "save a round trip" |
| TX-03 | Every write records an audit entry in the same transaction (INV-11, WFR-030) |
| TX-04 | Events are written to the outbox in-transaction and dispatched after commit. Never call another module's side effect directly |

---

## 4. Events

```python
# ✅
outbox.publish(SessionLogged(placement_id=p.id, session_id=s.id, mentor_id=m.id))

# ❌ synchronous side effect in the write path
notifications.send_supervisor_review_email(mentor.email)   # violates MA-02, TX-01, TX-04
```

| Rule | Statement |
| --- | --- |
| EV-01 | Event payloads carry **identifiers and a template key only**. Never escalation `description`/`action_taken`, never individual feedback text, never session free text (WFR-025). A database trigger rejects violations |
| EV-02 | Handlers are idempotent. Delivery is at-least-once |
| EV-03 | A handler failure never fails the originating command |
| EV-04 | **Never emit an event where a hard guard is required.** Eventual consistency on an invariant is a violated invariant. Use a synchronous read through `api.py` (§1.1) for anything that gates a decision |

EV-04 is the one to watch in review. "We'll publish an event and let the other module handle it" is correct for
a notification and catastrophic for INV-07.

---

## 5. Security and Scope

| Rule | Statement |
| --- | --- |
| SEC-01 | Scope is resolved **server-side** from the authenticated user, every request. A scope value in a request body or query string is ignored (AUTH-001) |
| SEC-02 | Every query against a scoped entity filters by scope **at the data-access layer**, not in the view. An endpoint that forgets its filter must return nothing, not everything (AUTH-002) |
| SEC-03 | Cross-scope access returns **404, never 403**. A 403 confirms the record exists (AUTH-004) |
| SEC-04 | Field-level restrictions are applied in serialisation, so no code path can leak a restricted field by returning a "full" object (AUTH-005) |
| SEC-05 | Escalation `description`/`action_taken` are never serialised into a **list** response — absent, not truncated |
| SEC-06 | Mentor-visible aggregates are suppressed below **3** responses, per displayed figure, with no attribute breakdowns (POL-013, POL-013a) |
| SEC-07 | Anonymous feedback never gains a placement or student reference. Do not "helpfully" add one (POL-014, ADR 0008) |
| SEC-08 | No patient-identifiable field is ever added. A migration introducing one fails CI |
| SEC-09 | Never log a restricted field value. Log identifiers |

---

## 6. Avoiding Circular Dependencies

Circular imports in Django usually mean a boundary is wrong, not that you need a clever import. In order of
preference:

1. **Check the direction.** If A and B need each other, one of them is in the wrong layer (§1.2), or the shared
   concept belongs in a lower module.
2. **Invert with a port** (§1.3) if a lower module genuinely needs a higher one's answer.
3. **Use an event** if the need is a side effect rather than a decision (§4).
4. **String references in models** — `ForeignKey("identity.User")`, never an import — which is required anyway
   for the two permitted cross-module FKs.
5. **Function-local imports** are a last resort, permitted only inside `AppConfig.ready()` for port
   registration. A function-local import anywhere else is a design smell with a comment attached.

```python
# ✅ models never import across modules
placement = models.ForeignKey("placements.Placement", on_delete=models.PROTECT)
created_by = models.ForeignKey("identity.User", on_delete=models.PROTECT)
```

**`apps.py` must not import models at module level.** Do it inside `ready()`, or Django's app registry will not
be populated yet and you will get an error that looks like a circular import but is not.

---

## 7. Errors

| Rule | Statement |
| --- | --- |
| ERR-01 | Every failure raises a domain error from `core.errors` — the Stage 3 §12 catalogue. Never a bare `ValueError`, never `Exception` |
| ERR-02 | Error codes are part of the **versioned API contract**. Renaming one is a breaking change |
| ERR-03 | Every error declares `retryable`. The offline client branches on it (Stage 6 §6.3) |
| ERR-04 | Messages are end-user safe and contain no restricted values |
| ERR-05 | `except Exception:` is not permitted outside the outbox worker and the top-level handler. Catch what you can act on |

---

## 8. Testing

| Rule | Statement |
| --- | --- |
| T-01 | **Every invariant has a test that attempts the violation and asserts the database refuses it.** These are the tests that make Stage 5 true rather than aspirational |
| T-02 | Every command has a test for the happy path *and* for each guard that can reject it |
| T-03 | Every `†` (idempotent) endpoint is tested twice with one key: one row, `Idempotency-Replayed: true` |
| T-04 | Every list endpoint is tested for scope isolation with a valid session from another tenant |
| T-05 | Tests run against **PostgreSQL**, never SQLite. SQLite cannot express most of our constraints, so a green SQLite run means nothing (ADR 0009) |
| T-06 | No test asserts on a log line or an email body. Assert on state and on published events |
| T-07 | Factories over fixtures; no shared mutable global state between tests |

---

## 9. Frontend Rules

| Rule | Statement |
| --- | --- |
| FE-01 | Features never import each other. Shared behaviour moves to `lib/` (MA-17) |
| FE-02 | Every mutating request goes through `lib/offline`, which assigns the `Idempotency-Key` at **form-open** time and owns the retry queue. No feature calls `fetch` for a write (MA-18) |
| FE-03 | Error copy is written once, mapped from the shared error catalogue (MA-19) |
| FE-04 | Gate UI on the capability flags from `GET /me`, never on role strings — the client must not re-implement the authorisation matrix |
| FE-05 | Enable action buttons from `GET /placements/{id}/transitions`, never from a client-side copy of the state machine |
| FE-06 | Every screen defines empty, loading, error, **offline-queued**, and success states |
| FE-07 | The logo comes from the `Logo` component. Never re-set the logotype in a font, never recolour outside the palette (`assets/brand/logo/README.md`) |

---

## 10. General Practice

- **Names come from the Ubiquitous Language** (Stage 2 §2.1). It is a Placement, not an Attachment or a
  Rotation. A Mentorship Session, not a Meeting. If the code and the clinicians use different words, the code
  is wrong.
- **No TODOs without an owner and an issue.** An unowned TODO is a decision nobody made.
- **No commented-out code.** Git remembers.
- **Comments explain *why*.** The code already says what.
- **Type hints on every service and `api.py` function.** They are the boundary contract.
- **No new dependency without a line in the PR description saying what it replaces and why.**
- **Config from the environment**, never a hardcoded host, key, or facility id.
- **`git` history is a design record.** One logical change per commit; the message says why.

---

## 11. Pull Request Checklist

- [ ] Layer rules respected — no upward or sideways imports (`import-linter` passes)
- [ ] Business logic in a service, not a view, serializer, model, or signal
- [ ] Any new write is inside `transaction.atomic()`, records an audit entry, and publishes via the outbox
- [ ] No external I/O inside a transaction
- [ ] New invariant → new constraint or trigger, **plus a test that proves the database refuses the violation**
- [ ] `IntegrityError` translated to a domain error, never swallowed
- [ ] New list endpoint → scope-isolation test
- [ ] New mutating endpoint → idempotency test
- [ ] No restricted field in a list response, event payload, log line, or export
- [ ] `makemigrations --check --dry-run` clean
- [ ] Names match the Ubiquitous Language

---

*Rules derived from the Stage 1–6 design documents in `docs/architecture/`. If a rule here and a design
document disagree, the design document wins and this file is the defect.*
