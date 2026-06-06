import * as path from "node:path";
import {
  MEMORY_SOFT_LIMIT,
  CLEANUP_MIN_BYTES,
  CLEANUP_DEDUP_WINDOW_MS,
  MAX_TOPIC_BYTES,
  ARCHIVE_DIR,
} from "./constants.js";
import type { MemoryEntry, MemoryParseResult, ClassifiedEntry, CleanupResult } from "./types.js";
import { parseMemoryMd } from "./parser.js";
import { readWithMtime, writeFile, snapshotDir, ensureDir } from "./files.js";
import { writeTopic, enforceTopicLimits } from "./topics.js";
import { generateSummary } from "./summary.js";
import { MEMORY_FILENAME, SUMMARY_FILENAME, TOPICS_DIR } from "./constants.js";

export function shouldTrigger(parseResult: MemoryParseResult): boolean {
  return parseResult.totalBytes > MEMORY_SOFT_LIMIT
    && parseResult.totalBytes > CLEANUP_MIN_BYTES;
}

export function classifyEntries(
  entries: MemoryEntry[],
  underPressure: boolean,
): ClassifiedEntry[] {
  return entries.map((entry) => {
    const score = computeRelocationScore(entry);

    let classification: ClassifiedEntry["classification"] = "HOT";
    let topicName: string | undefined;

    if (score >= 5 || (underPressure && score >= 3)) {
      classification = "TOPIC";
      topicName = deriveTopicName(entry.title);
    } else if (underPressure && score >= 2 && entry.ageDays > 14) {
      classification = "ARCHIVE";
    }

    return { entry, classification, score, topicName };
  });
}

export function deduplicate(
  classified: ClassifiedEntry[],
): ClassifiedEntry[] {
  const result = classified.map((c) => ({ ...c }));
  const now = Date.now();

  for (let i = 0; i < result.length; i++) {
    if (result[i].classification === "DELETE") continue;
    for (let j = i + 1; j < result.length; j++) {
      if (result[j].classification === "DELETE") continue;
      const a = result[i].entry;
      const b = result[j].entry;

      const dateA = Date.parse(a.date);
      const dateB = Date.parse(b.date);
      if (isNaN(dateA) || isNaN(dateB)) continue;
      if (Math.abs(dateA - dateB) > CLEANUP_DEDUP_WINDOW_MS) continue;

      const sim = titleSimilarity(a.title, b.title);
      if (sim > 0.65) {
        const laterIdx = dateB > dateA ? j : i;
        const earlierIdx = dateB > dateA ? i : j;
        result[earlierIdx].classification = "DELETE";
        if (!result[laterIdx].entry.content.includes(result[earlierIdx].entry.content)) {
          result[laterIdx].entry = {
            ...result[laterIdx].entry,
            content: result[earlierIdx].entry.content + "\n\n" + result[laterIdx].entry.content,
          };
        }
      }
    }
  }

  return result;
}

export function runCleanup(
  memoryDir: string,
  agentName: string,
  dryRun = false,
): CleanupResult {
  const memoryPath = path.join(memoryDir, MEMORY_FILENAME);
  const raw = readWithMtime(memoryPath);
  if (!raw) {
    return {
      keptCount: 0, movedToTopic: 0, archived: 0,
      merged: 0, deleted: 0, finalSizeBytes: 0, summaryRegenerated: false,
    };
  }

  const parsed = parseMemoryMd(raw);
  if (!shouldTrigger(parsed)) {
    return {
      keptCount: parsed.entries.length, movedToTopic: 0, archived: 0,
      merged: 0, deleted: 0, finalSizeBytes: parsed.totalBytes, summaryRegenerated: false,
    };
  }

  const underPressure = parsed.totalBytes > MEMORY_SOFT_LIMIT * 1.2;
  let classified = classifyEntries(parsed.entries, underPressure);
  classified = deduplicate(classified);

  if (dryRun) {
    return {
      keptCount: classified.filter((c) => c.classification === "HOT").length,
      movedToTopic: classified.filter((c) => c.classification === "TOPIC").length,
      archived: classified.filter((c) => c.classification === "ARCHIVE").length,
      merged: classified.filter((c) => c.classification === "DELETE").length,
      deleted: 0,
      finalSizeBytes: parsed.totalBytes,
      summaryRegenerated: false,
    };
  }

  // Snapshot before modifying
  const dateStr = new Date().toISOString().slice(0, 10);
  const archiveDir = path.join(memoryDir, ARCHIVE_DIR, dateStr);
  snapshotDir(memoryDir, archiveDir);

  let merged = 0;
  let movedToTopic = 0;
  let archived = 0;

  for (const item of classified) {
    switch (item.classification) {
      case "TOPIC":
        if (item.topicName) {
          writeTopic(memoryDir, item.topicName, item.entry.content.slice(0, 200), buildTopicContent(item.entry));
          movedToTopic++;
        }
        break;
      case "ARCHIVE":
        archived++;
        break;
      case "DELETE":
        merged++;
        break;
    }
  }

  // Rebuild MEMORY.md with kept entries
  const kept = classified.filter((c) => c.classification === "HOT");
  if (kept.length === 0 && classified.length > 0) {
    // Safety: keep at least one entry
    kept.push({ ...classified[classified.length - 1], classification: "HOT" });
    if (classified[classified.length - 1].classification === "DELETE") merged--;
    else if (classified[classified.length - 1].classification === "TOPIC") movedToTopic--;
    else if (classified[classified.length - 1].classification === "ARCHIVE") archived--;
  }

  const newContent = buildMemoryMd(parsed.preamble, kept.map((c) => c.entry));
  writeFile(memoryPath, newContent);

  // Regenerate summary
  const summary = generateSummary(agentName, kept.map((c) => c.entry));
  writeFile(path.join(memoryDir, SUMMARY_FILENAME), summary);

  // Enforce topic limits
  enforceTopicLimits(memoryDir);

  return {
    keptCount: kept.length,
    movedToTopic,
    archived,
    merged,
    deleted: 0,
    finalSizeBytes: Buffer.byteLength(newContent, "utf-8"),
    summaryRegenerated: true,
  };
}

function computeRelocationScore(entry: MemoryEntry): number {
  let score = 0;

  // Age factor
  if (entry.ageDays > 14) score += 3;
  else if (entry.ageDays > 7) score += 2;
  else if (entry.ageDays > 3) score += 1;

  // Size factor
  if (entry.byteSize > 2048) score += 2;
  else if (entry.byteSize > 1024) score += 1;

  // Type affinity
  const t = entry.type.toLowerCase();
  if (t === "pattern" || t === "reference") score += 2;
  else if (t === "problem" || t === "workflow") score += 1;

  return score;
}

function deriveTopicName(title: string): string {
  return title
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 6)
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function titleSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const tokensB = new Set(b.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  return intersection / (tokensA.size + tokensB.size - intersection);
}

function buildTopicContent(entry: MemoryEntry): string {
  return `# ${entry.title}\n\nType: ${entry.type}\n\n${entry.content}`;
}

function buildMemoryMd(preamble: string, entries: MemoryEntry[]): string {
  const parts: string[] = [];
  if (preamble.trim()) parts.push(preamble.trim());
  for (const entry of entries) {
    parts.push(`## ${entry.title}\nType: ${entry.type}\n\n${entry.content}`);
  }
  return parts.join("\n\n") + "\n";
}
