"""Ports owned by identity, implemented by higher layers (ADR 0003).

Identity is layer 0 and must not import placements. When an account stops being usable, modules that depend on that
person (for example a mentor's open placements) register a listener here and react inside the same transaction.
"""

from __future__ import annotations

from typing import Callable

_status_listeners: list[Callable] = []


def on_status_changed(listener: Callable) -> None:
    if listener not in _status_listeners:
        _status_listeners.append(listener)


def status_changed(user, *, previous: str) -> None:
    for listener in tuple(_status_listeners):
        listener(user, previous=previous)
