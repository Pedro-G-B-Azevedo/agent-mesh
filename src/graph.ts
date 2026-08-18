import { END, type EdgeTarget, type NodeId } from "./constants.js";
import { CompiledGraph } from "./executor.js";
import type { CompileOptions, ConditionalEdge, NodeHandler, Router } from "./types.js";

/**
 * Builder for a graph over a state shape TState.
 *
 * `TState extends Record<string, unknown>` (not `unknown`/`object`) because
 * the executor needs to shallow-merge `Partial<TState>` updates with `{
 * ...state, ...update }` — that operation only type-checks safely against a
 * plain key/value record, so the constraint documents (and enforces) what
 * kind of state this graph is allowed to carry.
 */
export class AgentGraph<TState extends Record<string, unknown>> {
  private readonly nodes = new Map<NodeId, NodeHandler<TState>>();
  private readonly edges = new Map<NodeId, EdgeTarget>();
  private readonly conditionalEdges = new Map<NodeId, ConditionalEdge<TState>>();
  private entryPoint: NodeId | undefined;

  addNode(id: NodeId, handler: NodeHandler<TState>): this {
    if (this.nodes.has(id)) {
      throw new Error(`Node "${id}" is already registered. Node ids must be unique.`);
    }
    this.nodes.set(id, handler);
    return this;
  }

  /** Fixed transition: after `from` runs, always go to `to`. */
  addEdge(from: NodeId, to: EdgeTarget): this {
    this.edges.set(from, to);
    return this;
  }

  /**
   * Branching transition: after `from` runs, call `router(state)` and use
   * its return value as a key into `pathMap` to find the next node.
   *
   * A node can have a static edge OR a conditional edge, not both — compile()
   * would otherwise have two conflicting sources of truth for "what's next".
   */
  addConditionalEdge(
    from: NodeId,
    router: Router<TState>,
    pathMap: Record<string, EdgeTarget>,
  ): this {
    this.conditionalEdges.set(from, { router, pathMap });
    return this;
  }

  setEntryPoint(id: NodeId): this {
    this.entryPoint = id;
    return this;
  }

  /**
   * Validates the whole topology and returns an executable graph.
   * Throws descriptive errors instead of deferring problems to `invoke()`.
   */
  compile(options: CompileOptions = {}): CompiledGraph<TState> {
    if (this.entryPoint === undefined) {
      throw new Error("Cannot compile: no entry point set. Call setEntryPoint(nodeId) first.");
    }
    if (!this.nodes.has(this.entryPoint)) {
      throw new Error(
        `Entry point "${this.entryPoint}" was never registered. Call addNode("${this.entryPoint}", ...) first.`,
      );
    }

    for (const id of this.nodes.keys()) {
      const hasStatic = this.edges.has(id);
      const hasConditional = this.conditionalEdges.has(id);
      if (hasStatic && hasConditional) {
        throw new Error(
          `Node "${id}" has both a static edge and a conditional edge. Pick one — a node's ` +
            `next step must come from a single source of truth.`,
        );
      }
      if (!hasStatic && !hasConditional) {
        throw new Error(
          `Node "${id}" has no outgoing edge. Every node must reach another node or END, ` +
            `via addEdge() or addConditionalEdge().`,
        );
      }
    }

    for (const [from, to] of this.edges) {
      if (to !== END && !this.nodes.has(to)) {
        throw new Error(`Edge from "${from}" points to unregistered node "${String(to)}".`);
      }
    }

    for (const [from, { pathMap }] of this.conditionalEdges) {
      for (const [caseKey, to] of Object.entries(pathMap)) {
        if (to !== END && !this.nodes.has(to)) {
          throw new Error(
            `Conditional edge from "${from}" (case "${caseKey}") points to unregistered node "${String(to)}".`,
          );
        }
      }
    }

    return new CompiledGraph(
      new Map(this.nodes),
      new Map(this.edges),
      new Map(this.conditionalEdges),
      this.entryPoint,
      options,
    );
  }
}
