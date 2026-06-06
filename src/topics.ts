import * as path from "node:path";
import * as fs from "node:fs";
import { STOPWORDS, TOPIC_NAME_RE, MAX_TOPICS, MAX_TOPIC_BYTES, TOPICS_DIR } from "./constants.js";
import type { TopicMeta, ScoredTopic } from "./types.js";
import { parseTopicFrontmatter } from "./parser.js";
import { ensureDir, writeFile, readWithMtime } from "./files.js";

export function listTopics(memoryDir: string): TopicMeta[] {
  const topicsDir = path.join(memoryDir, TOPICS_DIR);
  ensureDir(topicsDir);
  const files = fs.readdirSync(topicsDir).filter((f) => f.endsWith(".md"));
  const topics: TopicMeta[] = [];

  for (const file of files) {
    const filePath = path.join(topicsDir, file);
    const raw = readWithMtime(filePath);
    if (raw === null) continue;
    const { description } = parseTopicFrontmatter(raw);
    const stat = fs.statSync(filePath);
    topics.push({
      name: file.replace(/\.md$/, ""),
      description,
      filePath,
      byteSize: stat.size,
    });
  }

  return topics;
}

export function writeTopic(
  memoryDir: string,
  name: string,
  description: string,
  content: string,
): string {
  if (!TOPIC_NAME_RE.test(name)) {
    throw new Error(`Invalid topic name "${name}". Must be kebab-case, 2-60 alphanumeric chars.`);
  }

  const topicsDir = path.join(memoryDir, TOPICS_DIR);
  ensureDir(topicsDir);
  const filePath = path.join(topicsDir, `${name}.md`);

  const escapedDesc = description.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
  const body = `---\ndescription: "${escapedDesc}"\n---\n\n${content}\n`;
  writeFile(filePath, body);

  return filePath;
}

export function appendToTopic(
  memoryDir: string,
  name: string,
  content: string,
): string {
  const topicsDir = path.join(memoryDir, TOPICS_DIR);
  const filePath = path.join(topicsDir, `${name}.md`);

  const existing = readWithMtime(filePath);
  if (existing) {
    const updated = existing.trimEnd() + "\n\n" + content + "\n";
    writeFile(filePath, updated);
  } else {
    writeTopic(memoryDir, name, content.slice(0, 200), content);
  }
  return filePath;
}

export function deleteTopic(memoryDir: string, name: string): boolean {
  const filePath = path.join(memoryDir, TOPICS_DIR, `${name}.md`);
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export function matchTopics(query: string, topics: TopicMeta[]): ScoredTopic[] {
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) return [];

  const scored: ScoredTopic[] = [];

  for (const topic of topics) {
    const nameTokens = tokenizeKebab(topic.name);
    const descTokens = tokenize(topic.description);

    const nameScore = jaccard(queryTokens, nameTokens);
    const descScore = jaccard(queryTokens, descTokens);
    const rawScore = nameScore * 0.4 + descScore * 0.6;

    let bonus = 0;
    for (const token of queryTokens) {
      if (topic.description.toLowerCase().includes(token)) {
        bonus += 0.05;
      }
    }
    bonus = Math.min(bonus, 0.2);

    const finalScore = Math.min(1.0, rawScore + bonus);
    if (finalScore >= 0.1) {
      scored.push({
        name: topic.name,
        description: topic.description,
        filePath: topic.filePath,
        score: Math.round(finalScore * 1000) / 1000,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function enforceTopicLimits(memoryDir: string): string[] {
  const topics = listTopics(memoryDir);
  const archived: string[] = [];

  if (topics.length > MAX_TOPICS) {
    topics.sort((a, b) => {
      try {
        return fs.statSync(a.filePath).mtimeMs - fs.statSync(b.filePath).mtimeMs;
      } catch {
        return 0;
      }
    });

    const excess = topics.slice(0, topics.length - MAX_TOPICS);
    for (const topic of excess) {
      if (deleteTopic(memoryDir, topic.name)) {
        archived.push(topic.name);
      }
    }
  }

  return archived;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

function tokenizeKebab(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/[-_]+/)
      .filter((t) => t.length > 1),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  return intersection / (a.size + b.size - intersection);
}
