import type { EdgeTarget, NodeId } from "./constants.js";

/**
 * Minimal, provider-agnostic contract for "something that can answer a
 * prompt". The core graph/executor never imports a concrete SDK (Gemini,
 * Claude, OpenAI...) — every node that needs an LLM receives one of these
 * through ExecutionContext instead.
 *
 * Why: this is what makes the framework agnostic. A concrete adapter (e.g.
 * src/llm/gemini.ts) implements this interface; swapping providers means
 * swapping which object gets passed into `invoke()`, not touching the graph.
 * It also makes nodes trivially testable — tests inject a mock implementing
 * this same interface instead of hitting a real, billed API.
 */
export interface LLMClient {
  complete(prompt: string, options?: { temperature?: number }): Promise<string>;
}

/** Passed to every node handler. Carries cross-cutting dependencies (the
 * LLM client, a cancellation signal) so node code stays pure business logic
 * — it never has to know about tracing, retries, or which provider is live. */
export interface ExecutionContext {
  llm: LLMClient;
  signal?: AbortSignal;
}

/**
 * A node receives the *whole* current state (read-only) but returns only
 * the fields it changed, not the whole object back.
 *
 * Why: if a node had to return the full state, every node would need to
 * remember every field that exists anywhere in the graph, and a copy-paste
 * mistake could silently drop a field another node depends on. Returning a
 * partial update means a node only ever has to think about the slice of
 * state it actually owns; the executor is responsible for merging it in.
 */
export type NodeHandler<TState> = (
  state: Readonly<TState>,
  ctx: ExecutionContext,
) => Promise<Partial<TState>> | Partial<TState>;

/** Decides which edge to follow out of a node whose next step depends on
 * the resulting state (a branch), instead of always going to a fixed node. */
export type Router<TState> = (state: Readonly<TState>) => string;

export interface ConditionalEdge<TState> {
  router: Router<TState>;
  pathMap: Record<string, EdgeTarget>;
}

/** One row of the execution trace: exactly what a single node did on a
 * single run. This is the payload the future visualizer will render — the
 * static graph drawn once, this trace highlighting the path actually taken. */
export interface TraceStep<TState> {
  node: NodeId;
  stateBefore: Readonly<TState>;
  update: Partial<TState>;
  stateAfter: Readonly<TState>;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface ExecutionResult<TState> {
  finalState: TState;
  trace: TraceStep<TState>[];
  steps: number;
}

export interface CompileOptions {
  /** Hard ceiling on node visits per run. Default: 25.
   *
   * Why: a conditional edge is arbitrary code — a bug in a router can make
   * the graph loop between two nodes forever. Without a ceiling, that bug
   * hangs the process silently instead of failing with a message pointing
   * at the cause. */
  maxSteps?: number;
}

/**
 * Read-only, JSON-serializable snapshot of a compiled graph's topology —
 * plain arrays of plain objects, no Map, no class instance.
 *
 * Why this shape specifically: it's the input contract for the visualizer
 * (and for any other future consumer — a CLI graph-printer, a linter...).
 * Keeping it structural instead of exposing AgentGraph's internal Maps
 * means those consumers never depend on how the graph is stored internally,
 * only on what it means.
 */
export interface GraphDescription {
  entryPoint: NodeId;
  nodes: NodeId[];
  edges: { from: NodeId; to: EdgeTarget }[];
  conditionalEdges: { from: NodeId; cases: { key: string; to: EdgeTarget }[] }[];
}
