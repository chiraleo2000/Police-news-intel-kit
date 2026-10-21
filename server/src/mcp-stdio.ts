/**
 * MCP stdio shim for Claude scheduled tasks / plugin.
 * Bridges to local news-hub HTTP API (or direct DB if NEWSHUB_URL unreachable — DB direct).
 *
 * Tools:
 *   line_links_get  — links for date or recent new
 *   line_links_mark — mark used/skipped
 *   run_status_get / run_status_put
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
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

getDb();

const server = new Server(
  { name: "news-hub", version: "0.2.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "line_links_get",
      description:
        "ดึงลิงก์จาก LINE ที่เก็บใน DB (แหล่งจริง). ใช้ date=YYYY-MM-DD หรือ days=N สำหรับ status=new ย้อนหลัง. อย่า scrape registry ใน Task-2",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "ICT date YYYY-MM-DD (default today)" },
          status: {
            type: "string",
            enum: ["new", "used", "skipped"],
            description: "filter by status",
          },
          days: {
            type: "number",
            description: "if set, return status=new from last N days (ignores date)",
          },
        },
      },
    },
    {
      name: "line_links_mark",
      description: "อัปเดตสถานะลิงก์หลังใช้ในบทความ (used) หรือข้าม (skipped)",
      inputSchema: {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "number" } },
          status: { type: "string", enum: ["used", "skipped"] },
          article_id: { type: "string" },
          reason: { type: "string" },
        },
        required: ["ids", "status"],
      },
    },
    {
      name: "run_status_get",
      description: "ดูสถานะรอบล่าสุดของ task (แก้ปัญหา session ใหม่ไม่มี memory)",
      inputSchema: {
        type: "object",
        properties: { task: { type: "string" } },
      },
    },
    {
      name: "run_status_put",
      description: "บันทึกสถานะรอบนี้เมื่อจบงาน",
      inputSchema: {
        type: "object",
        properties: {
          task: { type: "string" },
          run_date: { type: "string" },
          status: {
            type: "string",
            enum: ["running", "complete", "partial", "failed"],
          },
          counts: { type: "object" },
          issues: { type: "array" },
        },
        required: ["task", "run_date", "status"],
      },
    },
    {
      name: "export_path_hint",
      description: "บอก path ของ Excel/JSON export เช้านี้ (สำหรับตรวจดู ถ้า MCP อ่าน DB ไม่ได้)",
      inputSchema: {
        type: "object",
        properties: { date: { type: "string" } },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;

  try {
    if (name === "line_links_get") {
      let links;
      let meta: Record<string, unknown> = {};
      if (typeof args.days === "number") {
        links = listRecentNewLinks(args.days);
        meta = { mode: "recent_new", days: args.days };
      } else {
        const date = (args.date as string) || todayIct();
        links = listLineLinks(date, args.status as string | undefined);
        meta = { date, status: args.status ?? null };
      }
      const out = {
        ...meta,
        count: links.length,
        links: links.map((r) => ({
          id: r.id,
          received_at: r.received_at,
          group_alias: r.group_alias,
          url: r.url,
          canonical_url: r.canonical_url,
          domain: r.domain,
          domain_type: r.domain_type,
          fetchable: Boolean(r.fetchable),
          status: r.status,
          used_in_article_id: r.article_id,
        })),
        note: "social/fetchable=false = reference only; do not full-scrape",
      };
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    if (name === "line_links_mark") {
      const ids = args.ids as number[];
      const status = args.status as "used" | "skipped";
      const n = markLineLinks(
        ids,
        status,
        (args.article_id as string) ?? null,
        (args.reason as string) ?? null,
      );
      audit("mcp", "line_links_mark", JSON.stringify(args));
      return {
        content: [{ type: "text", text: JSON.stringify({ updated: n }) }],
      };
    }

    if (name === "run_status_get") {
      const out = getRunStatus((args.task as string) || "task-2");
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    if (name === "run_status_put") {
      putRunStatus({
        task: args.task as string,
        run_date: args.run_date as string,
        status: args.status as string,
        counts_json: args.counts ? JSON.stringify(args.counts) : undefined,
        issues_json: args.issues ? JSON.stringify(args.issues) : undefined,
      });
      return { content: [{ type: "text", text: JSON.stringify({ ok: true }) }] };
    }

    if (name === "export_path_hint") {
      const date = (args.date as string) || todayIct();
      const base = `${config.exportPath}/${date}_line_links`;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              date,
              json: `${base}.json`,
              xlsx: `${base}.xlsx`,
              prefer: "line_links_get over Excel — Excel is export-only",
            }),
          },
        ],
      };
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (e) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
