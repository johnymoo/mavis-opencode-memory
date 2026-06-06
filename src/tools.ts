import * as path from "node:path";
import * as fs from "node:fs";
import { z } from "zod";
import { tool } from "@opencode-ai/plugin";
import type { ToolDefinition } from "@opencode-ai/plugin";
import {
  MEMORY_CLEANUP_TRIGGER,
  MEMORY_FILENAME,
  TOPICS_DIR,
  ARCHIVE_DIR,
} from "./constants.js";
import { readWithMtime, writeFile, appendToFile, fileByteSize, ensureDir } from "./files.js";
import { parseMemoryMd } from "./parser.js";
import { buildMemoryInjection } from "./injection.js";
import { runCleanup } from "./cleanup.js";
import { listTopics, writeTopic, matchTopics, deleteTopic } from "./topics.js";
import { generateSummary } from "./summary.js";

export function makeAppendTool(baseDir: string, agentFromCtx: (ctx: any) => string): ToolDefinition {
  return tool({
    description:
      `Append a new memory entry to MEMORY.md. Use this when you learn something ` +
      `reusable: patterns, gotchas, workflow notes, corrections. ` +
      `Format: "## {title} ({date})\\nType: {type}\\n{content}". ` +
      `Do NOT use for transient state or raw logs.`,
    args: {
      title: z.string().describe("Short descriptive title (date is added automatically)"),
      type: z
        .enum(["gotcha", "pattern", "workflow", "problem", "reference"])
        .describe("Category of this memory entry"),
      content: z.string().describe("The memory content in markdown"),
      reason: z
        .string()
        .optional()
        .describe("Why this is being stored (audit metadata)"),
    },
    async execute(args, ctx) {
      const agent = agentFromCtx(ctx);
      const memoryDir = path.join(baseDir, agent);
      ensureDir(memoryDir);
      const memoryPath = path.join(memoryDir, MEMORY_FILENAME);

      const date = new Date().toISOString().slice(0, 10);
      const reasonLine = args.reason ? `\n<!-- mem-append-reason: ${args.reason} -->` : "";
      const entry =
        `\n## ${args.title} (${date})\nType: ${args.type}${reasonLine}\n\n${args.content}\n`;

      const bytesAppended = appendToFile(memoryPath, entry);
      const totalSize = fileByteSize(memoryPath);

      let warning = "";
      if (totalSize > MEMORY_CLEANUP_TRIGGER) {
        warning = `\n\nWarning: MEMORY.md is now ${totalSize} bytes (above ${MEMORY_CLEANUP_TRIGGER} threshold). Consider running memory-cleanup to rebalance.`;
      }

      return `Appended ${bytesAppended} bytes to ${agent}/MEMORY.md. Total: ${totalSize} bytes.${warning}`;
    },
  });
}

export function makeShowTool(baseDir: string, agentFromCtx: (ctx: any) => string): ToolDefinition {
  return tool({
    description:
      `Show current memory state: MEMORY.md stats, topic list, and summary. ` +
      `Use this to inspect what's stored before deciding what to remember.`,
    args: {
      section: z
        .enum(["hot", "topics", "summary", "all"])
        .optional()
        .default("all")
        .describe("Which section to show"),
    },
    async execute(args, ctx) {
      const agent = agentFromCtx(ctx);
      const memoryDir = path.join(baseDir, agent);
      const memoryPath = path.join(memoryDir, MEMORY_FILENAME);

      const parts: string[] = [`Agent: ${agent}`];

      if (args.section === "hot" || args.section === "all") {
        const content = readWithMtime(memoryPath);
        if (content) {
          const parsed = parseMemoryMd(content);
          parts.push(`\nMEMORY.md: ${parsed.totalBytes} bytes, ${parsed.entries.length} entries`);
          if (args.section === "hot") {
            parts.push(content);
          }
        } else {
          parts.push("\nMEMORY.md: empty");
        }
      }

      if (args.section === "topics" || args.section === "all") {
        const topics = listTopics(memoryDir);
        parts.push(`\nTopics: ${topics.length}`);
        for (const t of topics) {
          parts.push(`  ${t.name} (${t.byteSize} bytes): ${t.description.slice(0, 80)}`);
        }
      }

      if (args.section === "summary" || args.section === "all") {
        const summaryPath = path.join(memoryDir, ".summary.md");
        const summary = readWithMtime(summaryPath);
        if (summary) {
          parts.push(`\nSummary:\n${summary}`);
        }
      }

      return parts.join("\n");
    },
  });
}

export function makeCleanupTool(baseDir: string, agentFromCtx: (ctx: any) => string): ToolDefinition {
  return tool({
    description:
      `Run rule-based memory cleanup. Classifies entries by age, size, and type, ` +
      `then moves qualifying entries to topic files or archive. Regenerates summary index. ` +
      `Run when MEMORY.md exceeds ~15KB or when memory-append warns about size.`,
    args: {
      dryRun: z
        .boolean()
        .optional()
        .default(false)
        .describe("Preview changes without modifying files"),
    },
    async execute(args, ctx) {
      const agent = agentFromCtx(ctx);
      const memoryDir = path.join(baseDir, agent);
      ensureDir(memoryDir);

      const result = runCleanup(memoryDir, agent, args.dryRun);

      const prefix = args.dryRun ? "[DRY RUN] " : "";
      return (
        `${prefix}Cleanup result for ${agent}:\n` +
        `  Kept: ${result.keptCount} entries\n` +
        `  Moved to topics: ${result.movedToTopic}\n` +
        `  Archived: ${result.archived}\n` +
        `  Merged (deduped): ${result.merged}\n` +
        `  Final size: ${result.finalSizeBytes} bytes\n` +
        `  Summary regenerated: ${result.summaryRegenerated}`
      );
    },
  });
}

export function makeWriteTopicTool(baseDir: string, agentFromCtx: (ctx: any) => string): ToolDefinition {
  return tool({
    description:
      `Create or update a topic file. Topics are domain knowledge files with ` +
      `a searchable description in YAML frontmatter. Use for detailed knowledge ` +
      `that doesn't need to be in every session's context.`,
    args: {
      name: z.string().describe("Topic name (kebab-case, used as filename)"),
      description: z.string().describe("Searchable description for topic matching"),
      content: z.string().describe("Full topic content in markdown"),
    },
    async execute(args, ctx) {
      const agent = agentFromCtx(ctx);
      const memoryDir = path.join(baseDir, agent);
      ensureDir(memoryDir);

      const filePath = writeTopic(memoryDir, args.name, args.description, args.content);
      const topics = listTopics(memoryDir);

      let warning = "";
      if (topics.length > 10) {
        warning = `\nWarning: ${topics.length} topics (max 10). Oldest may be archived on next cleanup.`;
      }

      return `Topic "${args.name}" written to ${filePath}.${warning}`;
    },
  });
}

export function makeSearchTool(baseDir: string, agentFromCtx: (ctx: any) => string): ToolDefinition {
  return tool({
    description:
      `Search topic files by keyword relevance. Returns matching topics ` +
      `sorted by score with descriptions. Use to find relevant domain knowledge.`,
    args: {
      query: z.string().describe("Search terms describing what you need"),
      threshold: z
        .number()
        .optional()
        .default(0.1)
        .describe("Minimum relevance score (0-1)"),
    },
    async execute(args, ctx) {
      const agent = agentFromCtx(ctx);
      const memoryDir = path.join(baseDir, agent);

      const topics = listTopics(memoryDir);
      const results = matchTopics(args.query, topics).filter(
        (r) => r.score >= args.threshold!,
      );

      if (results.length === 0) {
        return `No topics matching "${args.query}".`;
      }

      return results
        .map((r) => `[${r.score}] ${r.name}: ${r.description}`)
        .join("\n");
    },
  });
}
