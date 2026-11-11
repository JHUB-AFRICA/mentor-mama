"""Plain-text projection of lesson bodies (editor JSON or legacy plain text)."""

import json


def plain_text(body: str) -> str:
    try:
        doc = json.loads(body)
    except (TypeError, ValueError):
        return body or ""
    if not isinstance(doc, dict) or doc.get("type") != "doc":
        return body or ""
    blocks = {"paragraph", "heading", "listItem", "blockquote", "codeBlock"}
    parts: list[str] = []

    def walk(node):
        if not isinstance(node, dict):
            return
        if node.get("type") == "text":
            parts.append(str(node.get("text", "")))
        elif node.get("type") == "hardBreak":
            parts.append("\n")
        for child in node.get("content", []) or []:
            walk(child)
        if node.get("type") in blocks:
            parts.append("\n\n")

    walk(doc)
    return "".join(parts).strip()
