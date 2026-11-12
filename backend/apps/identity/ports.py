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


# A programme administrator's own data request is handled by the platform team, whose inbox lives in the platform
# module (above identity). It registers these two functions at start-up; identity never imports it.
_data_request_escalation: Callable | None = None
_data_request_status: Callable | None = None


def register_data_request_escalation(send: Callable, status: Callable) -> None:
    """`send(requester=, programme_name=, request=) -> reference`; `status(reference) -> (status, note) | None`."""
    global _data_request_escalation, _data_request_status
    _data_request_escalation, _data_request_status = send, status


def escalate_data_request(*, requester, programme_name: str, request) -> str | None:
    """Hand a request to the platform inbox. Returns its reference, or None when no inbox is registered."""
    return _data_request_escalation(requester=requester, programme_name=programme_name, request=request) if _data_request_escalation else None


def platform_data_request_status(reference: str):
    return _data_request_status(reference) if _data_request_status else None
