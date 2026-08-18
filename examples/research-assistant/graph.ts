import { AgentGraph, END } from "../../src/index.js";
import { criticNode, plannerNode, researcherNode, routeAfterCritic, writerNode } from "./agents.js";
import type { ResearchState } from "./state.js";

/**
 * Topology: planner → researcher → writer → critic → (writer | END).
 *
 * maxSteps is set explicitly instead of relying on the framework default
 * (25): planner + researcher run exactly once, writer/critic can loop at
 * most MAX_REVISIONS+1 times each — so every legitimate run finishes in at
 * most 2 + 2*(MAX_REVISIONS+1) = 8 steps. A ceiling of 12 stays generous
 * enough to never trip on a normal run, while still catching a real bug
 * (e.g. someone editing routeAfterCritic to loop unconditionally) much
 * faster than waiting for the generic default.
 */
export function buildResearchGraph() {
  return new AgentGraph<ResearchState>()
    .addNode("planner", plannerNode)
    .addNode("researcher", researcherNode)
    .addNode("writer", writerNode)
    .addNode("critic", criticNode)
    .addEdge("planner", "researcher")
    .addEdge("researcher", "writer")
    .addEdge("writer", "critic")
    .addConditionalEdge("critic", routeAfterCritic, {
      approved: END,
      revise: "writer",
    })
    .setEntryPoint("planner")
    .compile({ maxSteps: 12 });
}
