#!/usr/bin/env bash
# install_font.sh — ติดตั้งฟอนต์ Kanit ให้ระบบมองเห็น (สำหรับ wkhtmltoimage เรนเดอร์ภาษาไทย)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FONT_DIR="$HOME/.fonts"
mkdir -p "$FONT_DIR"
cp "$SCRIPT_DIR/../fonts/kanit/"*.ttf "$FONT_DIR/"
fc-cache -f "$FONT_DIR" > /dev/null 2>&1
echo "ติดตั้งฟอนต์ Kanit เสร็จแล้ว ตรวจสอบด้วย: fc-list | grep -i kanit"
