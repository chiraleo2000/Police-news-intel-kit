#!/usr/bin/env bash
# render_infographic.sh
# แปลงข้อมูล JSON -> HTML (ภายใน) -> .jpeg เท่านั้น (ไม่มี .docx / .pdf)
# ไฟล์ .html ที่สร้างระหว่างทางเป็นไฟล์ชั่วคราวเท่านั้น ไม่ส่งมอบให้ผู้ใช้
#
# Usage:
#   bash render_infographic.sh <input.json> <output_basename_no_ext>
#
# Requires: node, wkhtmltoimage

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT_JSON="$1"
OUT_BASENAME="$2"
TMP_HTML="$(mktemp --suffix=.html)"

node "$SCRIPT_DIR/build_infographic_html.js" "$INPUT_JSON" "$TMP_HTML"

wkhtmltoimage --width 960 --quality 92 "$TMP_HTML" "${OUT_BASENAME}.jpeg"

rm -f "$TMP_HTML"

echo "Wrote: ${OUT_BASENAME}.jpeg"
