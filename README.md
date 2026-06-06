# opencode-memory-plugin

A three-layer memory system for [OpenCode](https://github.com/opencode-ai/opencode) agents, implemented as a V1 plugin.

## What It Does

Gives OpenCode agents persistent, scoped memory across sessions:

- **Hot memory** (`MEMORY.md`) — always injected into the system prompt, for frequently needed rules and gotchas
- **Cold memory** (`topics/*.md`) — on-demand domain knowledge files, searchable by keyword
- **Summary index** (`.summary.md`) — auto-generated compressed index of all entries

Memory is stored globally at `~/.opencode/memory/{agent}/`, shared across all projects.

## Architecture

```
experimental.chat.system.transform hook
  ├── reads MEMORY.md → injects <agent_memory> block into system prompt
  ├── reads .summary.md → injects <agent_memory_summary> when MEMORY.md exceeds 10KB
  └── scans topics/ → injects <available_memory_topics> listing

5 registered tools:
  memory-append      — append an entry to MEMORY.md
  memory-show        — inspect current memory state
  memory-cleanup     — rule-based rebalance (classify → move to topics → archive → rebuild)
  memory-write-topic — create/update a topic file with YAML description
  memory-search      — keyword search across topics (Jaccard similarity)
```

## Installation

```bash
npm install opencode-memory-plugin
```

Then add to your project's `opencode.json`:

```json
{
  "plugin": ["./node_modules/opencode-memory-plugin/dist/index.js"]
}
```

Or reference directly:

```json
{
  "plugin": ["./path/to/opencode-memory-plugin/dist/index.js"]
}
```

## Memory Layout

```
~/.opencode/memory/{agent}/
├── MEMORY.md              # hot memory (≤15KB target, 20KB hard limit)
├── .summary.md            # compressed index (auto-generated, ≤4KB)
├── topics/                # cold memory (max 10 files, ≤30KB each)
│   ├── python-backend.md
│   └── react-patterns.md
└── archive/               # snapshots taken before each cleanup
    └── 2026-06-06/
        ├── MEMORY.md
        └── ...
```

## Entry Format

```markdown
## Title here (2026-06-06)
Type: gotcha

The actual memory content in markdown.
```

Types: `gotcha`, `pattern`, `workflow`, `problem`, `reference`

## Cleanup Algorithm

Rule-based (no LLM calls), triggered when MEMORY.md exceeds 15KB:

1. **Score** each entry: age (>14d: +3, >7d: +2) + size (>2KB: +2) + type (pattern: +2)
2. **Deduplicate** entries within 24h with Jaccard title similarity > 0.65
3. **Move** high-score entries to topic files
4. **Archive** snapshot to `archive/{date}/`
5. **Rebuild** MEMORY.md and regenerate `.summary.md`

## Topic Search

Topics are matched using Jaccard keyword similarity between the query and the topic's name + YAML description:

```
score = nameJaccard × 0.4 + descriptionJaccard × 0.6 + exactMatchBonus
```

## Configuration

Constants can be overridden by editing `src/constants.ts` before building:

| Constant | Default | Purpose |
|----------|---------|---------|
| `MEMORY_SOFT_LIMIT` | 15KB | Target size for MEMORY.md |
| `MEMORY_HARD_LIMIT` | 20KB | Maximum size before forced cleanup |
| `TAIL_CAP_CHARS` | 10KB | Max characters injected into system prompt |
| `SUMMARY_CAP_CHARS` | 4KB | Max summary size in prompt |
| `MAX_TOPICS` | 10 | Maximum topic files per agent |
| `MAX_TOPIC_BYTES` | 30KB | Maximum size per topic file |

## Comparison with Mavis

This plugin is a clean reimplementation of the memory system found in [Mavis (MiniMax Code)](https://opencode.ai/), which wraps OpenCode with proprietary extensions. Key differences:

| Dimension | Mavis (proprietary) | This plugin |
|-----------|---------------------|-------------|
| Cleanup | LLM-driven (spawns session) | Rule-based scoring (deterministic) |
| Topic search | Manual selection only | Jaccard keyword matching + search tool |
| Storage | `~/.mavis/agents/{name}/memory/` | `~/.opencode/memory/{agent}/` |
| Delta injection | Per-turn deltas via `<agent_memory_update>` | Full rebuild with mtime caching |
| License | Proprietary | MIT |

## License

MIT
