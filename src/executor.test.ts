import { describe, expect, it } from "vitest";
import { END } from "./constants.js";
import { AgentMeshError } from "./errors.js";
import { AgentGraph } from "./graph.js";
import { createMockLLM } from "./llm/mock-llm.js";
import type { ExecutionContext } from "./types.js";

interface CounterState extends Record<string, unknown> {
  count: number;
  label?: string;
}

const ctx: ExecutionContext = { llm: createMockLLM(["mock response"]) };

describe("CompiledGraph.invoke()", () => {
  it("runs a linear graph and shallow-merges each node's partial update", async () => {
    const graph = new AgentGraph<CounterState>()
      .addNode("increment", (state) => ({ count: state.count + 1 }))
      .addNode("label", (state) => ({ label: `count is ${state.count}` }))
      .addEdge("increment", "label")
      .addEdge("label", END)
      .setEntryPoint("increment")
      .compile();

    const result = await graph.invoke({ count: 0 }, ctx);

    expect(result.finalState).toEqual({ count: 1, label: "count is 1" });
    expect(result.steps).toBe(2);
    expect(result.trace.map((t) => t.node)).toEqual(["increment", "label"]);
  });

  it("follows a conditional edge based on the router's return value", async () => {
    const graph = new AgentGraph<CounterState>()
      .addNode("check", (state) => ({ count: state.count }))
      .addNode("even", () => ({ label: "even" }))
      .addNode("odd", () => ({ label: "odd" }))
      .addConditionalEdge("check", (state) => (state.count % 2 === 0 ? "even" : "odd"), {
        even: "even",
        odd: "odd",
      })
      .addEdge("even", END)
      .addEdge("odd", END)
      .setEntryPoint("check")
      .compile();

    const result = await graph.invoke({ count: 4 }, ctx);
    expect(result.finalState.label).toBe("even");
  });

  it("throws AgentMeshError with the trace attached when a router returns an unknown case", async () => {
    const graph = new AgentGraph<CounterState>()
      .addNode("check", (state) => ({ count: state.count }))
      .addNode("only", () => ({}))
      .addConditionalEdge("check", () => "not-a-real-case", { real: "only" })
      .addEdge("only", END)
      .setEntryPoint("check")
      .compile();

    await expect(graph.invoke({ count: 0 }, ctx)).rejects.toThrow(AgentMeshError);
  });

  it("stops with a clear error instead of hanging when the graph loops forever", async () => {
    const graph = new AgentGraph<CounterState>()
      .addNode("ping", (state) => ({ count: state.count + 1 }))
      .addNode("pong", (state) => ({ count: state.count + 1 }))
      // Bug on purpose: this always bounces back and forth and never reaches END.
      .addEdge("ping", "pong")
      .addEdge("pong", "ping")
      .setEntryPoint("ping")
      .compile({ maxSteps: 10 });

    await expect(graph.invoke({ count: 0 }, ctx)).rejects.toThrow(/exceeded maxSteps \(10\)/i);
  });

  it("wraps a node's thrown error in AgentMeshError with the partial trace attached", async () => {
    const graph = new AgentGraph<CounterState>()
      .addNode("ok", (state) => ({ count: state.count + 1 }))
      .addNode("boom", () => {
        throw new Error("simulated failure");
      })
      .addEdge("ok", "boom")
      .addEdge("boom", END)
      .setEntryPoint("ok")
      .compile();

    try {
      await graph.invoke({ count: 0 }, ctx);
      expect.unreachable("invoke() should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentMeshError);
      const meshError = error as AgentMeshError<CounterState>;
      expect(meshError.message).toMatch(/boom.*simulated failure/i);
      // The "ok" node ran successfully before "boom" failed, so it must
      // still show up in the trace attached to the error.
      expect(meshError.traceSoFar).toHaveLength(1);
      expect(meshError.traceSoFar[0]?.node).toBe("ok");
    }
  });
});
