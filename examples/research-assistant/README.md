# Example: Research Assistant with Self-Critique

A 4-agent pipeline built with Agent Mesh:

```
planner → researcher → writer → critic ─┬─→ END (approved)
                           ↑             │
                           └─── revise ──┘
```

- **planner** turns a topic into a short research plan.
- **researcher** synthesizes the key points for that plan.
- **writer** drafts a short report from the plan + research (and any critique from a previous pass).
- **critic** grades the draft and either approves it or sends it back to **writer** with feedback — capped at 2 revisions (see `state.ts`), so a normal run always converges without hitting the framework's `maxSteps` guard.

## Run it

```bash
cp examples/research-assistant/.env.example examples/research-assistant/.env
# edit .env, paste a free key from https://aistudio.google.com/apikey

npm run example:research -- "your topic here"
```

Each run writes `trace.html` next to this file (gitignored — it's
regenerated every time) — open it in a browser to see the graph with the
actual path highlighted. **Don't have a key handy?** [sample-trace.html](sample-trace.html)
is a real, committed output from an actual run — open it directly, no setup
needed.

## Why this example exists

The core library (`src/`) never imports `@google/genai` — this example is the
proof that a real provider can be plugged in through the same `LLMClient`
interface the unit tests exercise with a mock (`src/llm/mock-llm.ts`). Swap
`gemini-client.ts` for a Claude or OpenAI adapter and nothing in `agents.ts`
or `graph.ts` has to change.
