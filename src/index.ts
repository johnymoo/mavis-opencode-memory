import * as path from "node:path";
import * as os from "node:os";
import type { Plugin, Hooks, PluginInput } from "@opencode-ai/plugin";
import { buildMemoryInjection } from "./injection.js";
import {
  makeAppendTool,
  makeShowTool,
  makeCleanupTool,
  makeWriteTopicTool,
  makeSearchTool,
} from "./tools.js";

const SAFE_AGENT_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function sanitizeAgent(agent: unknown): string {
  const raw = typeof agent === "string" ? agent : "default";
  if (SAFE_AGENT_RE.test(raw)) return raw;
  return "default";
}

const plugin: Plugin = async (pluginInput: PluginInput) => {
  const baseDir = path.join(os.homedir(), ".opencode", "memory");
  const client = pluginInput.client;

  const agentFromCtx = (ctx: any): string => {
    return sanitizeAgent(ctx?.agent);
  };

  const agentCache = new Map<string, string>();

  async function resolveAgent(sessionId: string): Promise<string> {
    const cached = agentCache.get(sessionId);
    if (cached) return cached;
    try {
      const result = await client.session.get({ path: { id: sessionId } });
      const agent = sanitizeAgent((result.data as any)?.agent);
      agentCache.set(sessionId, agent);
      return agent;
    } catch {
      return "default";
    }
  }

  const hooks: Hooks = {};

  hooks["experimental.chat.system.transform"] = async (hookInput, output) => {
    const sessionId = hookInput.sessionID;
    if (!sessionId) return;

    const agent = await resolveAgent(sessionId);
    const memoryDir = path.join(baseDir, agent);
    const blocks = buildMemoryInjection(memoryDir);
    for (const block of blocks) {
      output.system.push(block);
    }
  };

  hooks.tool = {
    "memory-append": makeAppendTool(baseDir, agentFromCtx),
    "memory-show": makeShowTool(baseDir, agentFromCtx),
    "memory-cleanup": makeCleanupTool(baseDir, agentFromCtx),
    "memory-write-topic": makeWriteTopicTool(baseDir, agentFromCtx),
    "memory-search": makeSearchTool(baseDir, agentFromCtx),
  };

  return hooks;
};

export default plugin;
