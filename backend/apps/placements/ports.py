"""Ports owned by placements, implemented by higher layers (ADR 0003).

`placements` (layer 2) needs facts owned by `safeguarding` and `assessments`
(layer 3) before it may complete a placement. An upward import would create a
cycle, and an event-maintained counter would be eventually consistent — which on
INV-07 means a placement can be signed off with an open safeguarding concern.

So placements defines what it needs, and its children register implementations.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable
from uuid import UUID


@dataclass(frozen=True)
class BlockReason:
    code: str
    detail: dict | None = None


@runtime_checkable
class CompletionBlocker(Protocol):
    name: str

    def blocks(self, placement_id: UUID) -> BlockReason | None:
        """Return a reason if this placement may not be completed, else None."""


_registry: dict[str, CompletionBlocker] = {}


def register(blocker: CompletionBlocker) -> None:
    _registry[blocker.name] = blocker


def registered() -> tuple[CompletionBlocker, ...]:
    return tuple(_registry.values())


def blockers_for(placement_id: UUID) -> list[BlockReason]:
    return [r for b in _registry.values() if (r := b.blocks(placement_id)) is not None]


def require_registered(*names: str) -> None:
    """Start-up assertion: a module that fails to register is a missing guard (MA-16)."""
    missing = [n for n in names if n not in _registry]
    if missing:
        raise RuntimeError(f"completion blockers not registered: {missing}")
