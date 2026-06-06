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

const plugin: Plugin = async (input: PluginInput) => {
  const baseDir = path.join(os.homedir(), ".opencode", "memory");

  const agentFromCtx = (ctx: any): string => {
    return ctx?.agent ?? "default";
  };

  const hooks: Hooks = {};

  hooks["experimental.chat.system.transform"] = async (input, output) => {
    const sessionId = input.sessionID;
    if (!sessionId) return;

    // Use "default" agent since system.transform doesn't expose agent name.
    // Tool calls use ToolContext.agent which provides the actual agent name.
    const memoryDir = path.join(baseDir, "default");
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
