export interface MemoryEntry {
  title: string;
  date: string;
  type: string;
  content: string;
  byteSize: number;
  lineStart: number;
  lineEnd: number;
  ageDays: number;
}

export interface TopicMeta {
  name: string;
  description: string;
  filePath: string;
  byteSize: number;
}

export interface MemoryParseResult {
  preamble: string;
  entries: MemoryEntry[];
  totalBytes: number;
}

export type EntryClassification = "HOT" | "TOPIC" | "ARCHIVE" | "DELETE";

export interface ClassifiedEntry {
  entry: MemoryEntry;
  classification: EntryClassification;
  score: number;
  topicName?: string;
}

export interface CleanupResult {
  keptCount: number;
  movedToTopic: number;
  archived: number;
  merged: number;
  deleted: number;
  finalSizeBytes: number;
  summaryRegenerated: boolean;
}

export interface ScoredTopic {
  name: string;
  description: string;
  filePath: string;
  score: number;
}

export interface CachedFile {
  content: string;
  mtimeMs: number;
}
