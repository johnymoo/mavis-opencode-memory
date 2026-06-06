import type { MemoryEntry, MemoryParseResult } from "./types.js";

const ENTRY_RE = /^## /m;
const DATE_RE = /\((\d{4}-\d{2}-\d{2})\)/;
const TYPE_RE = /^Type:\s*(.+)$/m;

export function parseMemoryMd(content: string): MemoryParseResult {
  const lines = content.split("\n");
  const entries: MemoryEntry[] = [];
  let preamble = "";
  let entryStart = -1;
  let collectingPreamble = true;
  const totalBytes = Buffer.byteLength(content, "utf-8");

  const chunks: { startLine: number; text: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (ENTRY_RE.test(lines[i])) {
      if (collectingPreamble) {
        preamble = lines.slice(0, i).join("\n");
        collectingPreamble = false;
      }
      if (entryStart >= 0) {
        chunks.push({ startLine: entryStart, text: lines.slice(entryStart, i).join("\n") });
      }
      entryStart = i;
    }
  }
  if (entryStart >= 0) {
    chunks.push({ startLine: entryStart, text: lines.slice(entryStart).join("\n") });
  }
  if (collectingPreamble) {
    preamble = content;
  }

  const now = Date.now();
  for (const chunk of chunks) {
    const entry = parseEntry(chunk.text, chunk.startLine, now);
    if (entry) entries.push(entry);
  }

  return { preamble, entries, totalBytes };
}

function parseEntry(text: string, lineStart: number, now: number): MemoryEntry | null {
  const lines = text.split("\n");
  const titleLine = lines[0];
  const title = titleLine.replace(/^## /, "").trim();

  const dateMatch = title.match(DATE_RE);
  const date = dateMatch?.[1] ?? "";
  const typeMatch = text.match(TYPE_RE);
  const type = typeMatch?.[1]?.trim() ?? "unknown";

  const contentLines: string[] = [];
  let pastType = false;
  for (let i = 1; i < lines.length; i++) {
    if (!pastType && TYPE_RE.test(lines[i])) {
      pastType = true;
      continue;
    }
    contentLines.push(lines[i]);
  }
  const content = contentLines.join("\n").trim();
  const lineEnd = lineStart + lines.length - 1;

  let ageDays = 999;
  if (date) {
    const parsed = Date.parse(date);
    if (!isNaN(parsed)) {
      ageDays = Math.floor((now - parsed) / 86400000);
    }
  }

  return {
    title,
    date,
    type,
    content,
    byteSize: Buffer.byteLength(text, "utf-8"),
    lineStart: lineStart + 1,
    lineEnd: lineEnd + 1,
    ageDays,
  };
}

export function parseTopicFrontmatter(raw: string): { description: string; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { description: "", body: raw };

  const frontmatter = match[1];
  const body = match[2];
  const descMatch = frontmatter.match(/^description:\s*["']?(.+?)["']?\s*$/m);
  return {
    description: descMatch?.[1]?.trim() ?? "",
    body: body.trim(),
  };
}
