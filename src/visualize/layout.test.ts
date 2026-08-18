import { describe, expect, it } from "vitest";
import { END } from "../constants.js";
import type { GraphDescription } from "../types.js";
import { computeLayout } from "./layout.js";

describe("computeLayout", () => {
  it("assigns increasing x for a linear a -> b -> c -> END graph", () => {
    const description: GraphDescription = {
      entryPoint: "a",
      nodes: ["a", "b", "c"],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: END },
      ],
      conditionalEdges: [],
    };

    const layout = computeLayout(description);
    const xOf = (id: string | typeof END) => layout.positions.get(id)?.x;

    expect(xOf("a")).toBeLessThan(xOf("b") as number);
    expect(xOf("b")).toBeLessThan(xOf("c") as number);
    expect(xOf("c")).toBeLessThan(xOf(END) as number);
  });

  it("does not loop forever on a cyclic graph, and keeps a back-edge target at its first-seen layer", () => {
    // writer -> critic -> (writer | END): critic reaches writer again, but
    // writer must keep the layer it was FIRST assigned, not get pulled
    // forward every time the cycle is walked.
    const description: GraphDescription = {
      entryPoint: "writer",
      nodes: ["writer", "critic"],
      edges: [{ from: "writer", to: "critic" }],
      conditionalEdges: [
        { from: "critic", cases: [{ key: "revise", to: "writer" }, { key: "approved", to: END }] },
      ],
    };

    const layout = computeLayout(description);
    const xOf = (id: string | typeof END) => layout.positions.get(id)?.x as number;

    expect(xOf("writer")).toBeLessThan(xOf("critic"));
    expect(xOf(END)).toBeGreaterThan(xOf("critic"));
  });

  it("places every registered node somewhere, even if unreachable from the entry point", () => {
    const description: GraphDescription = {
      entryPoint: "a",
      nodes: ["a", "orphan"],
      edges: [{ from: "a", to: END }],
      conditionalEdges: [],
    };
    // Note: AgentGraph.compile() would actually reject a node with no
    // outgoing edge before this ever runs — this test just documents that
    // the layout function itself degrades gracefully (defaults to layer 0)
    // instead of crashing if it's ever handed a description built by hand.
    const layout = computeLayout(description);
    expect(layout.positions.has("orphan")).toBe(true);
  });
});
