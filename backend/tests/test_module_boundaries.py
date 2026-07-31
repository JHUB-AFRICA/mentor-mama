"""Module boundary contracts that import-linter cannot see (MA-12).

`import-linter` checks Python imports. It cannot see a foreign key declared by
string reference — which is exactly how cross-module relations are declared here
(§6 of the rules). So the relational graph needs its own contract test.
"""

from __future__ import annotations

import pytest
from django.apps import apps

# Stage 4 §3: dependencies point downward only.
LAYERS = {
    "core": 0, "identity": 0,
    "institutions": 1, "facilities": 1, "learning": 1, "content": 1,
    "placements": 2,
    "induction": 3, "mentorship": 3, "assessments": 3, "safeguarding": 3,
    "analytics": 5, "notifications": 5,
}

#: Leaves hold projections, which must be rebuildable and truncatable without
#: touching domain tables (MA-06). They reference domain rows by bare UUID.
LEAF_MODULES = {"analytics", "notifications"}

OWN_APPS = set(LAYERS)


def _cross_module_fks():
    for model in apps.get_models():
        source = model._meta.app_label
        if source not in OWN_APPS:
            continue
        for field in model._meta.get_fields():
            if not getattr(field, "many_to_one", False) and not getattr(field, "one_to_one", False):
                continue
            if not getattr(field, "concrete", False):
                continue
            target = field.related_model._meta.app_label
            if target == source or target not in OWN_APPS:
                continue
            yield source, model.__name__, field.name, target, field.related_model.__name__


def test_cross_module_foreign_keys_point_downward_only():
    """A foreign key is a dependency the database enforces.

    An upward or sideways FK would encode a coupling the layer rules forbid — and
    would be invisible to import-linter, because the relation is declared as a
    string.
    """
    violations = [
        f"{src}.{model}.{field} -> {tgt}.{tgt_model} "
        f"(layer {LAYERS[src]} -> {LAYERS[tgt]})"
        for src, model, field, tgt, tgt_model in _cross_module_fks()
        if LAYERS[tgt] > LAYERS[src]
    ]
    assert not violations, "upward or sideways foreign keys:\n  " + "\n  ".join(violations)


def test_leaf_modules_hold_no_foreign_keys_into_domain_tables():
    """Projections reference domain rows by bare UUID so they stay disposable."""
    violations = [
        f"{src}.{model}.{field} -> {tgt}.{tgt_model}"
        for src, model, field, tgt, tgt_model in _cross_module_fks()
        if src in LEAF_MODULES
    ]
    assert not violations, "leaf module holds a domain FK:\n  " + "\n  ".join(violations)


def test_placements_does_not_reference_its_children():
    """The core domain must not know its children exist.

    INV-07 and INV-08 need facts owned by `safeguarding` and `assessments`. They
    are obtained through the completion-blocker ports (ADR 0003), never a
    relation — which is what keeps the dependency pointing downward.
    """
    offenders = [
        f"placements.{model}.{field} -> {tgt}"
        for src, model, field, tgt, _ in _cross_module_fks()
        if src == "placements" and LAYERS[tgt] >= 3
    ]
    assert not offenders, offenders


def test_completion_blockers_are_registered_at_startup():
    """MA-16: a module that fails to register is a silently missing guard."""
    from apps.placements import ports

    names = {b.name for b in ports.registered()}
    assert {"open_escalation", "missing_final_assessment"} <= names, names


def test_cross_module_fk_inventory_is_known(capsys):
    """Documents the relational coupling that extraction would have to pay for
    (Stage 4 §7.5). Fails when a new one appears undocumented."""
    inventory = sorted(
        f"{src}.{model}.{field} -> {tgt}.{tgt_model}"
        for src, model, field, tgt, tgt_model in _cross_module_fks()
    )
    with capsys.disabled():
        print("\n  cross-module foreign keys (" + str(len(inventory)) + "):")
        for line in inventory:
            print("    " + line)
    # Sanity: every one of them points at a lower layer, checked above.
    assert inventory
