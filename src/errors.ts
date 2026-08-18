import type { TraceStep } from "./types.js";

/**
 * Every runtime failure carries the trace collected so far.
 *
 * Why: "node X threw" is much less useful than "node X threw, and here is
 * exactly what state looked like going into it and what the 3 nodes before
 * it did". Attaching the partial trace to the error itself means whoever
 * catches it doesn't have to separately wire up logging to get that context.
 */
export class AgentMeshError<TState = unknown> extends Error {
  public readonly traceSoFar: TraceStep<TState>[];

  constructor(message: string, traceSoFar: TraceStep<TState>[] = []) {
    super(message);
    this.name = "AgentMeshError";
    this.traceSoFar = traceSoFar;
  }
}
