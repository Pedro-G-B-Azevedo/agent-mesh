import { END, type EdgeTarget, type NodeId } from "./constants.js";
import { AgentMeshError } from "./errors.js";
import type {
  CompileOptions,
  ConditionalEdge,
  ExecutionContext,
  ExecutionResult,
  NodeHandler,
  TraceStep,
} from "./types.js";

const DEFAULT_MAX_STEPS = 25;

/**
 * The runnable result of AgentGraph.compile(). Holds the validated topology
 * and knows how to walk it once given a starting state.
 *
 * Why a separate class from AgentGraph instead of one big class: AgentGraph
 * is a *mutable builder* (addNode/addEdge keep changing it); CompiledGraph
 * is an *immutable, validated* plan. Merging them would let someone call
 * addNode() after compiling and silently invalidate a graph that already
 * passed validation. Splitting them makes "already validated" a property of
 * the type itself, not something you have to remember to re-check.
 */
export class CompiledGraph<TState extends Record<string, unknown>> {
  constructor(
    private readonly nodes: ReadonlyMap<NodeId, NodeHandler<TState>>,
    private readonly edges: ReadonlyMap<NodeId, EdgeTarget>,
    private readonly conditionalEdges: ReadonlyMap<NodeId, ConditionalEdge<TState>>,
    private readonly entryPoint: NodeId,
    private readonly options: CompileOptions,
  ) {}

  async invoke(initialState: TState, ctx: ExecutionContext): Promise<ExecutionResult<TState>> {
    const maxSteps = this.options.maxSteps ?? DEFAULT_MAX_STEPS;
    const trace: TraceStep<TState>[] = [];

    let current: NodeId | typeof END = this.entryPoint;
    let state = initialState;
    let steps = 0;

    while (current !== END) {
      if (steps >= maxSteps) {
        throw new AgentMeshError(
          `Graph exceeded maxSteps (${maxSteps}) without reaching END. Last node visited: ` +
            `"${current}". This usually means a conditional edge's router is looping — check ` +
            `its pathMap.`,
          trace,
        );
      }

      // Node lookup can't fail here: compile() already verified every edge
      // and conditional-edge target either is END or names a registered
      // node, so `current` can only be an id that exists in `this.nodes`.
      const handler = this.nodes.get(current) as NodeHandler<TState>;

      const stateBefore = state;
      const startedAt = Date.now();
      let update: Partial<TState>;
      try {
        update = await handler(state, ctx);
      } catch (cause) {
        throw new AgentMeshError(
          `Node "${current}" threw: ${cause instanceof Error ? cause.message : String(cause)}`,
          trace,
        );
      }
      const endedAt = Date.now();

      state = { ...state, ...update };
      trace.push({
        node: current,
        stateBefore,
        update,
        stateAfter: state,
        startedAt,
        endedAt,
        durationMs: endedAt - startedAt,
      });

      steps += 1;
      current = this.resolveNext(current, state, trace);
    }

    return { finalState: state, trace, steps };
  }

  private resolveNext(
    from: NodeId,
    state: TState,
    traceSoFar: TraceStep<TState>[],
  ): NodeId | typeof END {
    const conditional = this.conditionalEdges.get(from);
    if (conditional) {
      const caseKey = conditional.router(state);
      const target = conditional.pathMap[caseKey];
      if (target === undefined) {
        throw new AgentMeshError(
          `Router at node "${from}" returned "${caseKey}", which is not a key in its pathMap ` +
            `(${Object.keys(conditional.pathMap).join(", ")}).`,
          traceSoFar,
        );
      }
      return target;
    }

    // compile() guarantees a node has a static edge XOR a conditional edge,
    // so if we're here, `this.edges.get(from)` is guaranteed to be set.
    return this.edges.get(from) as EdgeTarget;
  }
}
