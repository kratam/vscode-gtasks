#!/usr/bin/env python3
"""Generate a compact B&W A4 PDF cheat sheet of VS Code keybindings."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, black, white
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import math
import os

OUTPUT = os.path.join(os.path.dirname(__file__), "vscode-keybindings-cheatsheet.pdf")

FONT = "SFMono"
try:
    pdfmetrics.registerFont(TTFont(FONT, "/System/Library/Fonts/SFNSMono.ttf"))
except Exception:
    FONT = "Courier"

# B&W colors
BG = white
TEXT = black
GRAY = HexColor("#666666")
LIGHT_GRAY = HexColor("#e8e8e8")
MED_GRAY = HexColor("#cccccc")
KEY_BG = HexColor("#f0f0f0")
KEY_BORDER = HexColor("#999999")
STAR_COLOR = HexColor("#333333")

WIDTH, HEIGHT = A4

CUSTOM_KEYS: set[str] = {
    "⌘-", "⇧⌥T", "⌘K ⌘D", "⌘K ⌘P", "⌘K ←/→",
    "⌘K K", "⌘K ⇧⌘W", "⌘K ⌘C", "⌘K ⌘N", "⌘⇧G",
}

sections = [
    ("Navigation", [
        ("⌘P", "Go to File"),
        ("⌘⇧O", "Go to Symbol"),
        ("⌃G", "Go to Line"),
        ("⌘⇧F", "Search in Files"),
        ("F12", "Go to Definition"),
        ("⌥F12", "Peek Definition"),
        ("⌃-", "Navigate Back"),
        ("⌃⇧-", "Navigate Forward"),
    ]),
    ("Editing", [
        ("⌘-", "Toggle Comment"),
        ("⌥↑/⌥↓", "Move Line Up/Down"),
        ("⇧⌥↑/⇧⌥↓", "Duplicate Line"),
        ("⌘D", "Select Next Match"),
        ("⌘⇧L", "Select All Matches"),
        ("F2", "Rename Symbol"),
        ("⌘.", "Quick Fix"),
        ("⇧⌥F", "Format Document"),
    ]),
    ("Editor Layout", [
        ("⌘\\", "Split Editor"),
        ("⌘1/⌘2", "Focus Group 1/2"),
        ("⌘K ⌘D", "Duplicate to Side"),
        ("⌘K ⌘P", "Focus Prev Group"),
        ("⌘K ←/→", "Move Editor L/R"),
        ("⌘K K", "Single Layout"),
        ("⌘K ⇧⌘W", "Close Other Groups"),
    ]),
    ("Panels & UI", [
        ("⌘B", "Toggle Sidebar"),
        ("⌘J", "Toggle Panel"),
        ("⇧⌥T", "Toggle Terminal"),
        ("⌘⇧E", "Explorer"),
        ("⌘⇧X", "Extensions"),
        ("⌘K Z", "Zen Mode"),
    ]),
    ("Extensions", [
        ("⌘⇧G", "New Todo (GTasks)"),
        ("⌘K ⌘C", "Claude Code Tab"),
        ("⌘K ⌘N", "Claude New Chat"),
    ]),
]


def draw_star(c: canvas.Canvas, cx: float, cy: float, r: float) -> None:
    c.setFillColor(STAR_COLOR)
    p = c.beginPath()
    for i in range(5):
        angle = math.radians(-90 + i * 72)
        p.lineTo(cx + r * math.cos(angle), cy + r * math.sin(angle)) if i else p.moveTo(cx + r * math.cos(angle), cy + r * math.sin(angle))
        ia = math.radians(-90 + i * 72 + 36)
        p.lineTo(cx + r * 0.4 * math.cos(ia), cy + r * 0.4 * math.sin(ia))
    p.close()
    c.drawPath(p, fill=1, stroke=0)


def draw_key(c: canvas.Canvas, x: float, y: float, text: str) -> float:
    fs = 7.5
    c.setFont(FONT, fs)
    tw = c.stringWidth(text, FONT, fs)
    w = tw + 8
    h = 14
    ky = y - h + 3
    # Shadow
    c.setFillColor(MED_GRAY)
    c.roundRect(x + 0.5, ky - 0.5, w, h, 2, fill=1, stroke=0)
    # Key cap
    c.setFillColor(KEY_BG)
    c.setStrokeColor(KEY_BORDER)
    c.setLineWidth(0.4)
    c.roundRect(x, ky, w, h, 2, fill=1, stroke=1)
    # Text
    c.setFillColor(TEXT)
    c.setFont(FONT, fs)
    c.drawCentredString(x + w / 2, y - 8, text)
    return w


def generate_pdf() -> None:
    c = canvas.Canvas(OUTPUT, pagesize=A4)

    margin_x = 14 * mm
    margin_top = 14 * mm
    col_gap = 8 * mm

    # Title
    y = HEIGHT - margin_top
    c.setFillColor(TEXT)
    c.setFont(FONT, 16)
    c.drawString(margin_x, y, "VS Code Keybindings")
    c.setFont(FONT, 8)
    c.setFillColor(GRAY)
    c.drawRightString(WIDTH - margin_x, y, "macOS")

    y -= 5 * mm
    # Legend
    draw_star(c, margin_x + 3, y + 2, 3)
    c.setFillColor(GRAY)
    c.setFont(FONT, 7)
    c.drawString(margin_x + 9, y, "= custom keybinding")

    y -= 2 * mm
    # Divider
    c.setStrokeColor(TEXT)
    c.setLineWidth(0.8)
    c.line(margin_x, y, WIDTH - margin_x, y)

    content_top = y - 4 * mm
    col_width = (WIDTH - 2 * margin_x - col_gap) / 2
    row_h = 17
    section_header_h = 14
    section_gap = 5

    # Calculate total height needed per section
    def section_height(s: tuple) -> float:
        return section_header_h + len(s[1]) * row_h + section_gap

    # Split sections into two columns
    total_h = sum(section_height(s) for s in sections)
    target_h = total_h / 2

    col1_sections = []
    col2_sections = []
    acc = 0.0
    for s in sections:
        sh = section_height(s)
        if acc + sh <= target_h + section_height(sections[0]) * 0.3:
            col1_sections.append(s)
            acc += sh
        else:
            col2_sections.append(s)

    def draw_column(
        sx: float, sy: float, w: float, secs: list[tuple]
    ) -> None:
        y = sy
        for title, keys in secs:
            # Section header
            c.setFillColor(TEXT)
            c.setFont(FONT, 9)
            c.drawString(sx, y, title.upper())
            y -= 2
            c.setStrokeColor(MED_GRAY)
            c.setLineWidth(0.5)
            c.line(sx, y, sx + w, y)
            y -= row_h * 0.6

            for key, desc in keys:
                is_custom = key in CUSTOM_KEYS
                # Key badge
                draw_key(c, sx, y, key)
                # Description
                dx = sx + 95
                c.setFillColor(TEXT)
                c.setFont(FONT, 8)
                if is_custom:
                    draw_star(c, dx + 3, y - 5, 3)
                    c.drawString(dx + 10, y - 8, desc)
                else:
                    c.drawString(dx, y - 8, desc)
                y -= row_h

            y -= section_gap

    draw_column(margin_x, content_top, col_width, col1_sections)
    draw_column(
        margin_x + col_width + col_gap, content_top, col_width, col2_sections
    )

    # Footer
    c.setFillColor(GRAY)
    c.setFont(FONT, 6)
    c.drawCentredString(WIDTH / 2, 8 * mm, "kratam · 2026-03-27")

    c.save()
    print(f"PDF saved to: {OUTPUT}")


if __name__ == "__main__":
    generate_pdf()
