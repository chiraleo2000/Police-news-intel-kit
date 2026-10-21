#!/usr/bin/env python3
"""
json_to_text.py
แปลงไฟล์ JSON ของ skill นี้ให้เป็น "สรุปข่าวแบบข้อความ" ตามฟอร์มมาตรฐาน (พร้อมคัดลอกไปวางใน LINE)
ใช้ได้ 2 โหมด ตามฟอร์มที่ผู้ใช้กำหนด:

  --mode 9tag   สรุปข่าวอาชญากรรมออนไลน์ประจำวัน (9 แท็ก)   -> เลขข้อเฉพาะชื่อข่าว: 1. 2. 3.
  --mode bch    สรุปข่าวจาก บช. (ทุกประเภทข่าว จัดกลุ่มตาม บช.) -> เลขข้อ: 1. (บช.) / 1.1 (ข่าว)

ฟอร์มใหม่: บรรทัดสรุปข่าวและบรรทัด ประเภทคดี/พื้นที่/สถานะ/มูลค่า/แก๊ง/อ้างอิง "ไม่มีเลขข้อกำกับ"
และไม่มีหัวข้อ "สรุปข่าว" — ประเด็นสำคัญแต่ละข้อขึ้นบรรทัดใหม่ ย่อหน้าเท่ากับบรรทัด ประเภทคดี

Usage:
  python3 json_to_text.py --mode 9tag input.json [output.txt]
  python3 json_to_text.py --mode bch  input.json [output.txt]
  (ไม่ใส่ output.txt = พิมพ์ออกหน้าจอ)

โครงสร้าง JSON (ดูตัวอย่างใน examples/):
  {
    "dateLabel": "21 ตุลาคม 2569",
    "categories": [                      # โหมด 9tag: 1 category = 1 แท็ก / โหมด bch: 1 category = 1 บช.
      { "title": "<ชื่อแท็ก หรือ ชื่อ บช.>",
        "items": [ { "title", "points": [...], "caseType", "location", "status",
                     "damage", "gang", "ref" } ] }
    ]
  }

กติกา:
  - category ที่ items ว่างจะถูกข้าม (ไม่แสดงในข้อความ)
  - "damage": null หรือ "gang": null  = ไม่แสดงบรรทัดนั้นเลย (ใช้กับข่าวหมวด "นโยบาย")
    ส่วนค่าอื่นที่ไม่มีข้อมูลให้ใส่ "-"
  - "caseType" ถ้าไม่ระบุ โหมด 9tag จะใช้ชื่อแท็กของ category แทน
  - "ref" เป็น string หรือ list ของลิงก์ก็ได้ (หลายลิงก์จะคั่นด้วย " , ")
"""
import argparse
import json
import sys

INDENT = "      "  # 6 ช่องว่าง: ใช้กับบรรทัดสรุปและบรรทัดรายละเอียดใต้ชื่อข่าว


def ref_text(ref):
    if isinstance(ref, (list, tuple)):
        return " , ".join(str(r) for r in ref)
    return str(ref) if ref else "-"


def detail_lines(item, default_case_type):
    """บรรทัดสรุปข่าว (ไม่มีเลข) ตามด้วย ประเภทคดี/พื้นที่/สถานะ/มูลค่า/แก๊ง/อ้างอิง (ไม่มีเลข)"""
    out = [f"{INDENT}{p}" for p in item.get("points", [])]
    fields = [
        ("ประเภทคดี", item.get("caseType") or default_case_type or "-", True),
        ("พื้นที่", item.get("location", "-"), True),
        ("สถานะ", item.get("status", "-"), True),
        # damage/gang เป็น None (null) = ไม่แสดงบรรทัด
        ("มูลค่าความเสียหาย", item.get("damage", "-"), "damage" not in item or item["damage"] is not None),
        ("ชื่อกลุ่ม/แก๊ง", item.get("gang", "-"), "gang" not in item or item["gang"] is not None),
        ("อ้างอิง", ref_text(item.get("ref")), True),
    ]
    for label, value, show in fields:
        if show:
            out.append(f"{INDENT}*{label} :* {value}")
    return out


def build_9tag(data):
    lines = [f"*สรุปข่าวอาชญากรรมออนไลน์ วันที่ {data['dateLabel']}*"]
    n = 0
    for cat in data["categories"]:
        for item in cat.get("items") or []:
            n += 1
            lines.append(f"*{n}. {item['title']}*")
            lines += detail_lines(item, cat["title"])
    return "\n".join(lines)


def build_bch(data):
    lines = [f"*สรุปข่าวจาก บช. วันที่ {data['dateLabel']}*"]
    b = 0
    for cat in data["categories"]:
        items = cat.get("items") or []
        if not items:
            continue
        b += 1
        lines.append(f"*{b}. {cat['title']}*")
        for n, item in enumerate(items, start=1):
            lines.append(f"   *{b}.{n} {item['title']}*")
            lines += detail_lines(item, None)
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", required=True, choices=["9tag", "bch"])
    ap.add_argument("input")
    ap.add_argument("output", nargs="?")
    args = ap.parse_args()

    with open(args.input, encoding="utf-8") as f:
        data = json.load(f)

    text = build_9tag(data) if args.mode == "9tag" else build_bch(data)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text + "\n")
        print(f"Wrote: {args.output}", file=sys.stderr)
    else:
        print(text)


if __name__ == "__main__":
    main()
