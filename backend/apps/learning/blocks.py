"""Allow-list validation of lesson bodies (editor documents).

A body is either legacy plain text or a ProseMirror/Tiptap ``doc``. Unknown nodes and marks are
rejected rather than silently stripped, links are limited to https/mailto, and images may only point
at uploaded learning media.
"""

import json
import re

MAX_BODY_BYTES = 200_000
MAX_DEPTH = 12

_NODES = {"doc", "paragraph", "text", "heading", "bulletList", "orderedList", "listItem", "blockquote",
          "hardBreak", "horizontalRule", "codeBlock", "callout", "image", "taskList", "taskItem"}
_MARKS = {"bold", "italic", "strike", "code", "underline", "link"}
_CALLOUTS = {"info", "tip", "safety"}
_MEDIA_SRC = re.compile(r"^/api/v1/training/media/[0-9a-f-]{36}$")


class InvalidBody(ValueError):
    pass


def _check_link(attrs: dict):
    href = str((attrs or {}).get("href", ""))
    if not (href.startswith("https://") or href.startswith("mailto:")):
        raise InvalidBody("Links must start with https:// or mailto:.")


def _walk(node, depth: int):
    if depth > MAX_DEPTH:
        raise InvalidBody("This lesson is nested too deeply.")
    if not isinstance(node, dict) or node.get("type") not in _NODES:
        raise InvalidBody("This lesson uses formatting that is not supported.")
    kind, attrs = node["type"], node.get("attrs") or {}
    if kind == "heading" and attrs.get("level") not in {1, 2, 3, 4}:
        raise InvalidBody("Headings must be level 1 to 4.")
    if kind == "callout" and attrs.get("variant", "info") not in _CALLOUTS:
        raise InvalidBody("Unknown callout type.")
    if kind == "image":
        if not _MEDIA_SRC.match(str(attrs.get("src", ""))):
            raise InvalidBody("Images must be uploaded to MentorMAMA.")
        if not str(attrs.get("alt", "")).strip():
            raise InvalidBody("Every image needs a short description (alt text) for screen readers.")
    if kind == "text" and not isinstance(node.get("text", ""), str):
        raise InvalidBody("Invalid text.")
    for mark in node.get("marks") or []:
        if not isinstance(mark, dict) or mark.get("type") not in _MARKS:
            raise InvalidBody("This lesson uses formatting that is not supported.")
        if mark["type"] == "link":
            _check_link(mark.get("attrs"))
    for child in node.get("content") or []:
        _walk(child, depth + 1)


def validate_body(body: str) -> None:
    """Raise InvalidBody when the body is a document that breaks the allow-list."""
    if len(body.encode("utf-8")) > MAX_BODY_BYTES:
        raise InvalidBody("This lesson is too long. Split it into two lessons.")
    try:
        doc = json.loads(body)
    except ValueError:
        return  # legacy plain text
    if isinstance(doc, dict) and doc.get("type") == "doc":
        _walk(doc, 0)
    # any other JSON-looking text (numbers, strings) is just text the author typed
