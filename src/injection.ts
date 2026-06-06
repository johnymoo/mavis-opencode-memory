import * as path from "node:path";
import { TAIL_CAP_CHARS, SUMMARY_CAP_CHARS, MEMORY_FILENAME, SUMMARY_FILENAME } from "./constants.js";
import { readWithMtime } from "./files.js";
import { listTopics } from "./topics.js";

export function buildMemoryInjection(memoryDir: string): string[] {
  const blocks: string[] = [];

  const memoryPath = path.join(memoryDir, MEMORY_FILENAME);
  const memoryContent = readWithMtime(memoryPath);

  if (memoryContent && memoryContent.trim()) {
    const contentLen = memoryContent.length;

    if (contentLen <= TAIL_CAP_CHARS) {
      blocks.push(buildTailBlock(memoryContent));
    } else {
      const summaryPath = path.join(memoryDir, SUMMARY_FILENAME);
      const summaryContent = readWithMtime(summaryPath);

      if (summaryContent && summaryContent.trim()) {
        const truncated = summaryContent.length > SUMMARY_CAP_CHARS
          ? summaryContent.slice(0, SUMMARY_CAP_CHARS)
          : summaryContent;
        blocks.push(buildSummaryBlock(truncated));
      }

      const tail = memoryContent.slice(-TAIL_CAP_CHARS);
      blocks.push(buildTailBlock(tail));

      if (!summaryContent && contentLen > TAIL_CAP_CHARS) {
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
    (t) => `  <topic name="${t.name}">${t.description}</topic>`
  );
  return (
    `<available_memory_topics>\n` +
    lines.join("\n") +
    `\n</available_memory_topics>`
  );
}
