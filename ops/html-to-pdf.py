#!/usr/bin/env python3
"""HTML → PDF with THSarabun. Order: weasyprint → playwright → Edge --print-to-pdf."""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def try_weasyprint(html: Path, pdf: Path) -> bool:
    try:
        from weasyprint import HTML  # type: ignore
    except Exception:
        return False
    HTML(filename=str(html)).write_pdf(str(pdf))
    return pdf.exists() and pdf.stat().st_size > 0


def try_playwright(html: Path, pdf: Path) -> bool:
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        return False
    uri = html.resolve().as_uri()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(uri, wait_until="networkidle")
        page.pdf(path=str(pdf), format="A4", print_background=True, margin={
            "top": "14mm", "bottom": "14mm", "left": "12mm", "right": "12mm"
        })
        browser.close()
    return pdf.exists() and pdf.stat().st_size > 0


def try_edge(html: Path, pdf: Path) -> bool:
    edge = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
    if not edge.exists():
        edge = Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe")
    if not edge.exists():
        return False
    pdf.parent.mkdir(parents=True, exist_ok=True)
    # Edge needs absolute file URL and output path
    cmd = [
        str(edge),
        "--headless",
        "--disable-gpu",
        f"--print-to-pdf={pdf.resolve()}",
        html.resolve().as_uri(),
    ]
    subprocess.run(cmd, check=False, capture_output=True)
    return pdf.exists() and pdf.stat().st_size > 0


def convert(html: Path, pdf: Path) -> str:
    pdf.parent.mkdir(parents=True, exist_ok=True)
    if try_weasyprint(html, pdf):
        return "weasyprint"
    if try_playwright(html, pdf):
        return "playwright"
    if try_edge(html, pdf):
        return "edge"
    raise RuntimeError(f"no PDF backend worked for {html}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="Convert all crime HTML reports (default)")
    ap.parse_args()
    document = ROOT / "Document"
    downloads = ROOT / "github-pages" / "data" / "downloads"
    jobs = []
    for folder in sorted(document.glob("*_Crime*")):
        if not folder.is_dir():
            continue
        for html in sorted(folder.glob("*_crime*.html")):
            if "infographic" in html.name:
                continue
            pdf = html.with_suffix(".pdf")
            jobs.append((html, pdf))
    ok = 0
    for html, pdf in jobs:
        try:
            engine = convert(html, pdf)
            dest = downloads / pdf.name
            shutil.copy2(pdf, dest)
            print(f"OK [{engine}] {pdf} → {dest} ({pdf.stat().st_size} bytes)")
            ok += 1
        except Exception as e:
            print(f"FAIL {html}: {e}", file=sys.stderr)
    print(f"done {ok}/{len(jobs)}")
    return 0 if ok == len(jobs) else 1


if __name__ == "__main__":
    raise SystemExit(main())
