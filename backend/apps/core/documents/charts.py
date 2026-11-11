"""Small, print-first SVG charts for documents. No gradients, shadows or 3D (brand guidelines §05, §08)."""

from __future__ import annotations

import math
from html import escape

SERIES = ["#1D8C8C", "#22304A", "#5B8DB8", "#8FB8B5", "#B9C3CF", "#7C8BA1", "#D97757"]
INK = "#0D1B33"
MUTED = "#5E6C81"
TRACK = "#EEF2F5"


def bar_list(items: list[tuple[str, int]], *, width: float = 360, row: float = 22, label_width: float = 118) -> str:
    """Horizontal bars, one per item, value printed at the end of each bar."""
    items = items or [("Nothing to show", 0)]
    top = max(1, max(value for _, value in items))
    track = width - label_width - 34
    height = row * len(items)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">']
    for index, (label, value) in enumerate(items):
        y = index * row
        bar = max(2.0, track * value / top) if value else 0
        parts.append(
            f'<text x="0" y="{y + row / 2 + 3.2}" font-family="Inter" font-size="8.2" fill="{INK}">{escape(label)}</text>'
            f'<rect x="{label_width}" y="{y + 6}" width="{track}" height="{row - 12}" rx="{(row - 12) / 2}" fill="{TRACK}"/>'
            + (f'<rect x="{label_width}" y="{y + 6}" width="{bar:.1f}" height="{row - 12}" rx="{(row - 12) / 2}" fill="{SERIES[0]}"/>' if bar else "")
            + f'<text x="{label_width + track + 8}" y="{y + row / 2 + 3.2}" font-family="Inter" font-weight="600" font-size="8.2" fill="{INK}">{value}</text>'
        )
    parts.append("</svg>")
    return "".join(parts)


def donut(items: list[tuple[str, int]], *, size: float = 120, thickness: float = 16, centre_label: str = "", colours: list[str] | None = None) -> tuple[str, list[dict]]:
    """A donut split and the legend rows that go beside it (label, value, share, colour)."""
    total = sum(value for _, value in items)
    radius = (size - thickness) / 2
    circumference = 2 * math.pi * radius
    centre = size / 2
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">',
        f'<circle cx="{centre}" cy="{centre}" r="{radius}" fill="none" stroke="{TRACK}" stroke-width="{thickness}"/>',
    ]
    legend = []
    offset = 0.0
    for index, (label, value) in enumerate(items):
        palette = colours or SERIES
        colour = palette[index % len(palette)]
        share = value / total if total else 0
        legend.append({"label": label, "value": value, "share": round(share * 100), "colour": colour})
        if not share:
            continue
        length = circumference * share
        gap = 1.2 if len([v for _, v in items if v]) > 1 else 0
        parts.append(
            f'<circle cx="{centre}" cy="{centre}" r="{radius}" fill="none" stroke="{colour}" stroke-width="{thickness}" '
            f'stroke-dasharray="{max(0.0, length - gap):.2f} {circumference:.2f}" stroke-dashoffset="{-offset:.2f}" '
            f'transform="rotate(-90 {centre} {centre})"/>'
        )
        offset += length
    parts.append(
        f'<text x="{centre}" y="{centre + 2}" text-anchor="middle" font-family="Manrope" font-weight="700" font-size="20" fill="{INK}">{total}</text>'
        f'<text x="{centre}" y="{centre + 15}" text-anchor="middle" font-family="Inter" font-size="7" fill="{MUTED}">{escape(centre_label)}</text>'
        "</svg>"
    )
    return "".join(parts), legend
