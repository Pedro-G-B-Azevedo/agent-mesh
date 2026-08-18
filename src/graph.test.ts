import { describe, expect, it } from "vitest";
import { END } from "./constants.js";
import { AgentGraph } from "./graph.js";

interface State extends Record<string, unknown> {
  count: number;
}

describe("AgentGraph.compile() validation", () => {
  it("throws if no entry point was set", () => {
    const graph = new AgentGraph<State>().addNode("a", () => ({})).addEdge("a", END);
    expect(() => graph.compile()).toThrow(/no entry point/i);
  });

  it("throws if the entry point was never registered as a node", () => {
    const graph = new AgentGraph<State>()
      .addNode("a", () => ({}))
      .addEdge("a", END)
      .setEntryPoint("ghost");
    expect(() => graph.compile()).toThrow(/ghost.*never registered/i);
  });

  it("throws if a node has no outgoing edge", () => {
    const graph = new AgentGraph<State>().addNode("a", () => ({})).setEntryPoint("a");
    expect(() => graph.compile()).toThrow(/no outgoing edge/i);
  });

  it("throws if a static edge points to an unregistered node", () => {
    const graph = new AgentGraph<State>()
      .addNode("a", () => ({}))
      .addEdge("a", "does-not-exist")
      .setEntryPoint("a");
    expect(() => graph.compile()).toThrow(/unregistered node "does-not-exist"/i);
  });

  it("throws if a conditional edge's pathMap points to an unregistered node", () => {
    const graph = new AgentGraph<State>()
      .addNode("a", () => ({}))
      .addConditionalEdge("a", () => "ok", { ok: "does-not-exist" })
      .setEntryPoint("a");
    expect(() => graph.compile()).toThrow(/unregistered node "does-not-exist"/i);
  });

  it("throws if a node has both a static edge and a conditional edge", () => {
    const graph = new AgentGraph<State>()
      .addNode("a", () => ({}))
      .addNode("b", () => ({}))
      .addEdge("a", "b")
      .addConditionalEdge("a", () => "x", { x: END })
      .addEdge("b", END)
      .setEntryPoint("a");
    expect(() => graph.compile()).toThrow(/both a static edge and a conditional edge/i);
  });

  it("compiles successfully for a valid linear graph", () => {
    const graph = new AgentGraph<State>()
      .addNode("a", () => ({}))
      .addEdge("a", END)
      .setEntryPoint("a");
    expect(() => graph.compile()).not.toThrow();
  });
});
