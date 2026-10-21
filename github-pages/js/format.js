/** Formatting helpers for Thai crime-news GitHub Pages */

window.NewsFormat = {
  /** ISO YYYY-MM-DD → Thai Buddhist Era display */
  dateTh(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "—";
    const [y, m, d] = iso.split("-").map(Number);
    const months = [
      "", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
      "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
    ];
    return `${d} ${months[m]} ${y + 543}`;
  },

  number(n) {
    if (n === null || n === undefined || n === "") return "—";
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString("th-TH");
  },

  money(n) {
    if (n === null || n === undefined || Number(n) === 0) return "—";
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    if (x >= 1_000_000) return `${(x / 1_000_000).toLocaleString("th-TH", { maximumFractionDigits: 1 })} ลบ.`;
    return `${x.toLocaleString("th-TH")} บาท`;
  },

  severityLabel(s) {
    const map = { high: "สูง", medium: "กลาง", low: "ต่ำ" };
    return map[s] || s || "—";
  },

  verificationLabel(v) {
    const map = {
      official_confirmed: "ยืนยันจากทางการ",
      media_only: "สื่อเท่านั้น",
      single_source: "แหล่งเดียว",
    };
    return map[v] || v || "";
  },

  truncate(text, n = 120) {
    if (!text) return "";
    const t = String(text).replace(/\s+/g, " ").trim();
    return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
  },
};
