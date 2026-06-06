import * as fs from "node:fs";
import * as path from "node:path";
import type { CachedFile } from "./types.js";

const cache = new Map<string, CachedFile>();

export function clearCache(): void {
  cache.clear();
}

export function readWithMtime(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    const cached = cache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.content;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    cache.set(filePath, { content, mtimeMs: stat.mtimeMs });
    return content;
  } catch {
    return null;
  }
}

export function writeFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
  const stat = fs.statSync(filePath);
  cache.set(filePath, { content, mtimeMs: stat.mtimeMs });
}

export function appendToFile(filePath: string, content: string): number {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const existing = readWithMtime(filePath) ?? "";
  const updated = existing + (existing.endsWith("\n") ? "" : "\n") + content;
  writeFile(filePath, updated);
  return Buffer.byteLength(content, "utf-8");
}

export function fileByteSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

export function snapshotDir(srcDir: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir);
  for (const name of entries) {
    if (name === "archive" || name === "topics") continue;
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, dest);
    }
  }
}

export function listFiles(dir: string, exclude: Set<string> = new Set()): string[] {
  try {
    return fs.readdirSync(dir)
      .filter((f) => !exclude.has(f) && f.endsWith(".md"));
  } catch {
    return [];
  }
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
