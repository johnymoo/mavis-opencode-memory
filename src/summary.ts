import { SUMMARY_CAP_CHARS, MAX_SUMMARY_ENTRIES, SUMMARY_ENTRY_CHARS } from "./constants.js";
import type { MemoryEntry } from "./types.js";

export function generateSummary(header: string, entries: MemoryEntry[]): string {
  const parts: string[] = [`# ${header} — compressed index\n`];

  for (const entry of entries) {
    const compressed = compressEntry(entry);
    parts.push(
      `\n## ${entry.title}\n` +
      `- ${compressed} source: memory/MEMORY.md:${entry.lineStart}-${entry.lineEnd}\n`
    );
  }

  let result = parts.join("");
  if (Buffer.byteLength(result, "utf-8") > SUMMARY_CAP_CHARS) {
    const keepMin = Math.max(5, entries.length - MAX_SUMMARY_ENTRIES);
    const keepEntries = entries.slice(keepMin);
    const truncated: string[] = [
      `# ${header} — compressed index\n`,
      `\n> Older entries truncated. Read MEMORY.md for full history.\n`,
    ];
    for (const entry of keepEntries) {
      const compressed = compressEntry(entry);
      truncated.push(
        `\n## ${entry.title}\n` +
        `- ${compressed} source: memory/MEMORY.md:${entry.lineStart}-${entry.lineEnd}\n`
      );
    }
    result = truncated.join("");
  }

  return result;
}

function compressEntry(entry: MemoryEntry): string {
  const firstParagraph = entry.content
    .split(/\n{2,}/)[0]
    .replace(/^[-*]\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n/g, " ")
    .trim();

  if (firstParagraph.length <= SUMMARY_ENTRY_CHARS) {
    return firstParagraph + ". ";
  }
  return firstParagraph.slice(0, SUMMARY_ENTRY_CHARS).replace(/\s+\S*$/, "") + "... ";
}
