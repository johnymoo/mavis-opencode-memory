export const MEMORY_SOFT_LIMIT = 15 * 1024;
export const MEMORY_HARD_LIMIT = 20 * 1024;
export const MEMORY_CLEANUP_TRIGGER = 18 * 1024;
export const SUMMARY_CAP_CHARS = 4 * 1024;
export const TAIL_CAP_CHARS = 10 * 1024;
export const MAX_TOPICS = 10;
export const MAX_TOPIC_BYTES = 30 * 1024;
export const CLEANUP_DEDUP_WINDOW_MS = 24 * 3600 * 1000;
export const CLEANUP_MIN_BYTES = 10 * 1024;
export const MAX_SUMMARY_ENTRIES = 15;
export const SUMMARY_ENTRY_CHARS = 300;
export const MIN_ENTRIES_AFTER_CLEANUP = 1;

export const MEMORY_FILENAME = "MEMORY.md";
export const SUMMARY_FILENAME = ".summary.md";
export const TOPICS_DIR = "topics";
export const ARCHIVE_DIR = "archive";

export const TOPIC_NAME_RE = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/;

export const STOPWORDS = new Set([
  "the", "a", "an", "is", "for", "to", "with", "in", "on", "at",
  "of", "and", "or", "it", "this", "that", "by", "from", "as",
  "be", "was", "are", "been", "has", "have", "had", "do", "does",
  "did", "not", "but", "if", "so", "no", "up", "out", "can",
  "will", "just", "into", "over", "after", "how", "use", "when",
  "what", "which", "who", "all", "each", "more", "than", "then",
]);
