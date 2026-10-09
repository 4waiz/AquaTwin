"""
Build the final report from its editable source.

  report/AquaTwin-Report.md  (source, Markdown + a little HTML)
    → report/AquaTwin-Report.html  (self-contained styling, relative image paths)
    → report/AquaTwin-Report.pdf   (Chrome print via Playwright; cover without page number)

Usage:  python scripts/report/build.py
"""

from __future__ import annotations

import datetime as dt
import re
from pathlib import Path

import fitz  # PyMuPDF: merge cover and body
import markdown
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / "report"
SRC = REPORT / "AquaTwin-Report.md"
HTML = REPORT / "AquaTwin-Report.html"
PDF = REPORT / "AquaTwin-Report.pdf"

CSS = """
@font-face { font-family: 'Geist'; src: url('../video/composition/assets/fonts/Geist-Latin.woff2') format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'Geist Mono'; src: url('../video/composition/assets/fonts/GeistMono-Latin.woff2') format('woff2'); font-weight: 100 900; }
@page { size: A4; margin: 18mm 17mm 18mm 17mm; }
:root { --ink: #0f1722; --muted: #4a5566; --faint: #7a8596; --rule: #d9dee6; --accent: #0a72d6; --soft: #f3f7fb; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: "Geist", "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: var(--ink); font-size: 9.6pt; line-height: 1.5; background: #fff; }
a { color: var(--accent); text-decoration: none; }
h1, h2, h3 { color: var(--ink); line-height: 1.25; }
h2 { font-size: 15pt; margin: 20pt 0 6pt; padding-top: 6pt; border-top: 2px solid transparent; border-image: linear-gradient(90deg, #22b5fb, #0a84ea 30%, var(--rule) 30%) 1; break-after: avoid; letter-spacing: -0.01em; }
.pb { break-before: page; height: 0; }
h3 { font-size: 11pt; margin: 14pt 0 4pt; break-after: avoid; }
p { margin: 0 0 7pt; }
ul, ol { margin: 0 0 8pt; padding-left: 16pt; }
li { margin: 0 0 3pt; }
strong { font-weight: 650; }
em { color: var(--ink); }
code { font-family: "Geist Mono", Consolas, "Cascadia Mono", monospace; font-size: 8.4pt; background: var(--soft); padding: 0 3px; border-radius: 3px; }
pre { background: var(--soft); border: 1px solid var(--rule); border-radius: 6px; padding: 8pt 10pt; font-size: 8.2pt; line-height: 1.45; break-inside: avoid; white-space: pre-wrap; }
pre code { background: none; padding: 0; }
table { width: 100%; border-collapse: collapse; margin: 6pt 0 10pt; font-size: 8.8pt; break-inside: avoid; }
th { text-align: left; font-weight: 600; color: var(--muted); border-bottom: 1.2px solid #b7c0cc; padding: 4pt 6pt; }
td { border-bottom: 1px solid var(--rule); padding: 4pt 6pt; vertical-align: top; }
figure { margin: 10pt 0 12pt; break-inside: avoid; }
figure img { width: 100%; display: block; border-radius: 4px; }
figure.wide img { border: 1px solid var(--rule); }
figure img[src$=".svg"] { border: none; }
figcaption { font-size: 8.3pt; color: var(--muted); margin-top: 4pt; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 14pt; align-items: start; break-inside: avoid; }
.two figure { margin-top: 4pt; }
/* architecture diagram */
.arch { margin: 8pt 0 12pt; display: grid; gap: 8pt; break-inside: avoid; }
.arch-row { display: grid; grid-template-columns: 1fr 14pt 1fr 14pt 1fr 14pt 1fr; align-items: stretch; }
.arch-box { border: 1px solid #b9c6d8; border-radius: 6px; padding: 6pt 7pt; background: #f6f9fd; font-size: 8.2pt; }
.arch-box b { display: block; font-size: 8.8pt; margin-bottom: 2pt; color: var(--ink); }
.arch-box span { color: var(--muted); }
.arch-box.src { background: #fff; border-style: dashed; }
.arch-box.guard { border-color: #0a72d6; background: #eaf5fe; }
.arch-box.op { background: #fff; }
.arch-arrow { display: flex; align-items: center; justify-content: center; color: var(--faint); font-size: 11pt; }
/* cover: full-bleed, the app's dark brand */
.cover { box-sizing: border-box; width: 210mm; height: 297mm; padding: 15mm 17mm 12mm; display: flex; flex-direction: column; color: #e8edf4;
  background: radial-gradient(120% 60% at 0% 0%, #0b2c57 0%, #05142a 42%, #03070d 100%); }
.cover a { color: #5ec8ff; }
.cover-head { display: flex; gap: 11pt; align-items: center; }
.cover-logo { width: 15mm; height: 15mm; border-radius: 3.2mm; box-shadow: 0 0 12mm rgba(34,181,251,.35); }
.cover-kicker { font-size: 9pt; color: #c8d1dd; letter-spacing: .01em; font-weight: 500; }
.cover-theme { font-size: 8.6pt; color: #5ec8ff; margin-top: 2pt; font-family: "Geist Mono", monospace; letter-spacing: .02em; }
.cover h1 { font-size: 50pt; margin: 16pt 0 0; color: #fff; letter-spacing: -0.035em; line-height: 1; }
.cover h1 .grad { color: #2bb7fb; }
.cover-sub { font-size: 14.5pt; color: #fff; font-weight: 600; margin: 8pt 0 5pt; letter-spacing: -0.01em; line-height: 1.25; }
.cover-tag { font-size: 9.6pt; color: #a2acba; margin: 0 0 11pt; max-width: 168mm; line-height: 1.45; }
.cover-img { width: 100%; border-radius: 2.5mm; border: 1px solid rgba(255,255,255,.14); box-shadow: 0 6mm 16mm rgba(0,0,0,.5); }
.glance { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9pt; margin-top: 11pt; }
.glance div { border-top: 2px solid #22b5fb; padding-top: 5pt; }
.glance b { display: block; font-size: 15pt; letter-spacing: -0.02em; color: #fff; }
.glance span { display: block; font-size: 7.8pt; color: #a2acba; line-height: 1.35; margin-top: 2pt; }
.glance-note { font-size: 7.6pt; color: #8a95a6; margin-top: 7pt; }
.cover-meta { margin-top: auto; display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 6pt 16pt; padding-top: 9pt; border-top: 1px solid rgba(255,255,255,.14); }
.cover-meta div { font-size: 9pt; }
.cover-meta span { display: block; font-family: "Geist Mono", monospace; font-size: 7pt; letter-spacing: .1em; text-transform: uppercase; color: #6d7787; margin-bottom: 1pt; }
.cover-meta b { font-weight: 600; color: #e8edf4; }
.cover-note { font-size: 7.4pt; color: #6d7787; margin: 9pt 0 0; line-height: 1.4; }
/* rubric map */
table.rubric { margin-top: 10pt; }
table.rubric th { background: #0b1d33; color: #e8edf4; border-bottom: 0; }
table.rubric th:first-child { border-radius: 4px 0 0 0; } table.rubric th:last-child { border-radius: 0 4px 0 0; }
table.rubric td:nth-child(2) { font-weight: 650; color: var(--accent); white-space: nowrap; }
.appendix figure { margin: 8pt 0 14pt; }
.appendix h2:first-of-type { break-before: page; }
.refs ol { font-size: 8.2pt; line-height: 1.36; padding-left: 18pt; }
.refs li { margin-bottom: 2pt; }
"""

FOOTER = (
    '<div style="width:100%;font-family:Segoe UI,Arial,sans-serif;font-size:7.5pt;color:#7a8596;'
    'padding:0 17mm;display:flex;justify-content:space-between;">'
    "<span>AquaTwin · Final report · Team Kanban · CMAT-00022</span>"
    '<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>'
)


def page(body: str, title: str, extra_css: str = "") -> str:
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><style>{CSS}{extra_css}</style></head><body>{body}</body></html>"""


def main() -> None:
    src = SRC.read_text(encoding="utf-8")
    src = re.sub(r"<!--.*?-->", "", src, count=1, flags=re.S)  # build notes at the top
    src = src.replace("{{DATE}}", dt.date.today().strftime("%B %Y"))
    md = markdown.Markdown(extensions=["tables", "fenced_code", "attr_list", "md_in_html", "sane_lists"])
    html = md.convert(src)
    # Split the cover (first <section class="cover">) from the body.
    m = re.search(r'<section class="cover">.*?</section>', html, flags=re.S)
    cover = m.group(0) if m else ""
    body = html.replace(cover, "", 1) if m else html
    title = "AquaTwin: Final report, Team Kanban"
    HTML.write_text(page(cover + body, title), encoding="utf-8")
    cover_html = REPORT / "_cover.html"
    body_html = REPORT / "_body.html"
    cover_html.write_text(page(cover, title, "@page { margin: 0; } body { background: #03070d; }"), encoding="utf-8")
    body_html.write_text(page(body, title), encoding="utf-8")

    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome")
        pg = b.new_page()
        parts = []
        for f, footer in ((cover_html, False), (body_html, True)):
            pg.goto(f.as_uri(), wait_until="networkidle")
            pg.evaluate("() => Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })))")
            out = REPORT / f"_{f.stem}.pdf"
            pg.pdf(
                path=str(out),
                format="A4",
                print_background=True,
                prefer_css_page_size=True,
                display_header_footer=footer,
                header_template="<div></div>",
                footer_template=FOOTER if footer else "<div></div>",
                margin={"top": "18mm", "bottom": "18mm", "left": "17mm", "right": "17mm"} if footer else {"top": "0", "bottom": "0", "left": "0", "right": "0"},
            )
            parts.append(out)
        b.close()

    doc = fitz.open()
    for part in parts:
        with fitz.open(part) as d:
            doc.insert_pdf(d)
    doc.set_metadata({"title": title, "author": "Team Kanban", "subject": "Khalifa University–UNESCO Global Water Hackathon 2026", "creator": "scripts/report/build.py"})
    doc.save(PDF)
    n = doc.page_count
    doc.close()
    for f in (cover_html, body_html, *parts):
        f.unlink(missing_ok=True)
    print(f"wrote {HTML.relative_to(ROOT)} and {PDF.relative_to(ROOT)} ({n} pages)")


if __name__ == "__main__":
    main()
