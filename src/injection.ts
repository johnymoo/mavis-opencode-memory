import * as path from "node:path";
import { TAIL_CAP_CHARS, SUMMARY_CAP_CHARS, MEMORY_FILENAME, SUMMARY_FILENAME } from "./constants.js";
import { readWithMtime } from "./files.js";
import { listTopics } from "./topics.js";

function byteLength(s: string): number {
  return Buffer.byteLength(s, "utf-8");
}

function sliceByBytes(s: string, maxBytes: number): string {
  if (byteLength(s) <= maxBytes) return s;
  let end = Math.floor(maxBytes * s.length / byteLength(s));
  while (end > 0 && byteLength(s.slice(0, end)) > maxBytes) end--;
  return s.slice(0, end);
}

function sliceByBytesTail(s: string, maxBytes: number): string {
  if (byteLength(s) <= maxBytes) return s;
  let start = Math.floor(s.length * (1 - maxBytes / byteLength(s)));
  while (start < s.length && byteLength(s.slice(start)) > maxBytes) start++;
  return s.slice(start);
}

export function buildMemoryInjection(memoryDir: string): string[] {
  const blocks: string[] = [];

  const memoryPath = path.join(memoryDir, MEMORY_FILENAME);
  const memoryContent = readWithMtime(memoryPath);

  if (memoryContent && memoryContent.trim()) {
    const contentBytes = byteLength(memoryContent);

    if (contentBytes <= TAIL_CAP_CHARS) {
      blocks.push(buildTailBlock(memoryContent));
    } else {
      const summaryPath = path.join(memoryDir, SUMMARY_FILENAME);
      const summaryContent = readWithMtime(summaryPath);

      if (summaryContent && summaryContent.trim()) {
        const truncated = sliceByBytes(summaryContent, SUMMARY_CAP_CHARS);
        blocks.push(buildSummaryBlock(truncated));
      }

      const tail = sliceByBytesTail(memoryContent, TAIL_CAP_CHARS);
      blocks.push(buildTailBlock(tail));

      if (!summaryContent && contentBytes > TAIL_CAP_CHARS) {
        blocks.push(
          `<memory_note>Older entries are not shown. Read MEMORY.md for full history, ` +
          `or run memory-cleanup to generate a compressed index.</memory_note>`
        );
      }
    }
  }

  const topics = listTopics(memoryDir);
  if (topics.length > 0) {
    blocks.push(buildTopicsBlock(topics));
  }

  return blocks;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildTailBlock(content: string): string {
  return `<agent_memory>\n${content}\n</agent_memory>`;
}

function buildSummaryBlock(content: string): string {
  return `<agent_memory_summary>\n${content}\n</agent_memory_summary>`;
}

interface TopicInfo {
  name: string;
  description: string;
}

function buildTopicsBlock(topics: TopicInfo[]): string {
  const lines = topics.map(
    (t) => `  <topic name="${escapeXml(t.name)}">${escapeXml(t.description)}</topic>`
  );
  return (
    `<available_memory_topics>\n` +
    lines.join("\n") +
    `\n</available_memory_topics>`
  );
}
