/**
 * MCP stdio shim for Claude scheduled tasks / plugin.
 * Tools call the local SQLite brain directly (same process as this shim).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "./config.js";
import {
  getDb,
  listLineLinks,
  listRecentNewLinks,
  markLineLinks,
  getRunStatus,
  putRunStatus,
  audit,
} from "./db/index.js";
import { todayIct } from "./line/url.js";
import { brainUpsert } from "./brain/upsert.js";

getDb();

const server = new McpServer({ name: "news-hub", version: "0.2.0" });

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(e: unknown) {
  return {
    content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
    isError: true as const,
  };
}

async function run<T>(fn: () => Promise<T> | T) {
  try {
    return text(await fn());
  } catch (e) {
    return fail(e);
  }
}

server.registerTool(
  "line_links_get",
  {
    description:
      "ดึงลิงก์จาก LINE ที่เก็บใน DB. ใช้ date=YYYY-MM-DD หรือ days=N สำหรับ status=new ย้อนหลัง",
    inputSchema: {
      date: z.string().optional(),
      status: z.enum(["new", "used", "skipped"]).optional(),
      days: z.number().optional(),
    },
  },
  async ({ date, status, days }) =>
    run(() => {
      if (typeof days === "number") {
        const links = listRecentNewLinks(days);
        return { mode: "recent_new", days, count: links.length, links };
      }
      const day = date || todayIct();
      const links = listLineLinks(day, status);
      return { date: day, status: status ?? null, count: links.length, links };
    }),
);

server.registerTool(
  "line_links_mark",
  {
    description: "อัปเดตสถานะลิงก์หลังใช้ในบทความ (used) หรือข้าม (skipped)",
    inputSchema: {
      ids: z.array(z.number()),
      status: z.enum(["used", "skipped"]),
      article_id: z.string().optional(),
      reason: z.string().optional(),
    },
  },
  async (args) =>
    run(() => {
      const updated = markLineLinks(args.ids, args.status, args.article_id ?? null, args.reason ?? null);
      audit("mcp", "line_links_mark", JSON.stringify(args));
      return { updated };
    }),
);

server.registerTool(
  "run_status_get",
  {
    description: "ดูสถานะรอบล่าสุดของ task",
    inputSchema: { task: z.string().optional() },
  },
  async ({ task }) => run(() => getRunStatus(task || "task-2")),
);

server.registerTool(
  "run_status_put",
  {
    description: "บันทึกสถานะรอบนี้เมื่อจบงาน",
    inputSchema: {
      task: z.string(),
      run_date: z.string(),
      status: z.enum(["running", "complete", "partial", "failed"]),
      counts: z.record(z.unknown()).optional(),
      issues: z.array(z.unknown()).optional(),
    },
  },
  async (args) =>
    run(() => {
      putRunStatus({
        task: args.task,
        run_date: args.run_date,
        status: args.status,
        counts_json: args.counts ? JSON.stringify(args.counts) : undefined,
        issues_json: args.issues ? JSON.stringify(args.issues) : undefined,
      });
      return { ok: true };
    }),
);

server.registerTool(
  "export_path_hint",
  {
    description: "บอก path ของ Excel/JSON export",
    inputSchema: { date: z.string().optional() },
  },
  async ({ date }) =>
    run(() => {
      const day = date || todayIct();
      const base = `${config.exportPath}/${day}_line_links`;
      return { date: day, json: `${base}.json`, xlsx: `${base}.xlsx` };
    }),
);

server.registerTool(
  "brain_search",
  {
    description: "ค้นคดี/เอนทิตีใน second brain. บังคับใช้ก่อนโยง related_cases",
    inputSchema: {
      q: z.string(),
      type: z.enum(["case", "entity", "unit", "person", "project", "all"]).optional(),
      limit: z.number().optional(),
    },
  },
  async ({ q, type, limit }) =>
    run(async () => {
      const query = q.trim();
      if (!query) return { query: "", cases: [], entities: [] };
      const { searchBrain } = await import("./brain/store.js");
      return searchBrain(query, type, limit || 30);
    }),
);

server.registerTool(
  "brain_timeline",
  {
    description: "ดึงคดีในช่วงวันที่ สำหรับลำดับเวลาและ related",
    inputSchema: {
      since: z.string().optional(),
      until: z.string().optional(),
      bureau: z.string().optional(),
      crime_type: z.string().optional(),
    },
  },
  async (args) =>
    run(async () => {
      const { timelineBrain } = await import("./brain/store.js");
      return timelineBrain(args.since || "1970-01-01", args.until || "2999-12-31", args.bureau, args.crime_type);
    }),
);

server.registerTool(
  "brain_upsert",
  {
    description:
      "บันทึกข้อเสนอรวมชื่อ / timeline หน่วยงาน / โน้ตรายสัปดาห์. ห้ามใช้ลบหรือรวม entity เอง",
    inputSchema: {
      kind: z.enum(["merge_proposal", "entity_timeline", "weekly_note"]),
      status: z.string().optional(),
      keep: z.string().optional(),
      merge: z.array(z.string()).optional(),
      reason: z.string().optional(),
      entity: z.string().optional(),
      entries: z.array(z.record(z.unknown())).optional(),
      week: z.string().optional(),
      body: z.string().optional(),
    },
  },
  async (args) => run(() => brainUpsert(args)),
);

const transport = new StdioServerTransport();
await server.connect(transport);
