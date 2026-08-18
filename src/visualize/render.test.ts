import { describe, expect, it } from "vitest";
import { END } from "../constants.js";
import type { ExecutionResult, GraphDescription } from "../types.js";
import { renderTraceHtml } from "./render.js";

const description: GraphDescription = {
  entryPoint: "planner",
  nodes: ["planner", "writer", "critic"],
  edges: [
    { from: "planner", to: "writer" },
    { from: "writer", to: "critic" },
  ],
  conditionalEdges: [
    { from: "critic", cases: [{ key: "revise", to: "writer" }, { key: "approved", to: END }] },
  ],
};

function fakeResult(): ExecutionResult<{ count: number }> {
  return {
    finalState: { count: 1 },
    steps: 3,
    trace: [
      {
        node: "planner",
        stateBefore: { count: 0 },
        update: {},
        stateAfter: { count: 0 },
        startedAt: 0,
        endedAt: 5,
        durationMs: 5,
      },
      {
        node: "writer",
        stateBefore: { count: 0 },
        update: {},
        stateAfter: { count: 0 },
        startedAt: 5,
        endedAt: 12,
        durationMs: 7,
      },
      {
        node: "critic",
        stateBefore: { count: 0 },
        update: { count: 1 },
        stateAfter: { count: 1 },
        startedAt: 12,
        endedAt: 20,
        durationMs: 8,
      },
    ],
  };
}

/** Finds the CSS class of the specific <g class="edge ..."> block whose
 * body contains `labelSubstring`, instead of searching the whole document —
 * `[\s\S]*` across the full HTML string would match across unrelated edges
 * and give a false positive/negative. */
function edgeGroupClass(html: string, labelSubstring: string): string | undefined {
  for (const match of html.matchAll(/<g class="(edge[^"]*)">([\s\S]*?)<\/g>/g)) {
    const [, cssClass, body] = match;
    if (body?.includes(labelSubstring)) return cssClass;
  }
  return undefined;
}

describe("renderTraceHtml", () => {
  it("renders a self-contained HTML document with the static graph when no result is given", () => {
    const html = renderTraceHtml(description);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("planner");
    expect(html).toContain("writer");
    expect(html).toContain("critic");
    expect(html).toContain("END");
    expect(html).toContain("Static graph shape");
  });

  it("highlights the executed nodes/edges and the case label taken when a result is given", () => {
    const html = renderTraceHtml(description, fakeResult(), { title: "Test run" });
    expect(html).toContain("Test run");
    expect(html).toContain("3 steps executed");
    expect(html).toContain("node-executed");
    // The trace ends at "critic" — invoke() only ever returns once END is
    // reached, so that last step is correctly inferred as the critic→END
    // transition, labeled "approved". The "revise" case (critic→writer)
    // never happened in this fixture and must stay idle.
    expect(edgeGroupClass(html, "approved")).toContain("edge-executed");
    expect(edgeGroupClass(html, "revise")).toBe("edge edge-idle");
  });

  it("escapes node ids so an id containing markup can't break out of the SVG/HTML", () => {
    const maliciousId = "<script>alert(1)</script>";
    const evil: GraphDescription = {
      entryPoint: maliciousId,
      nodes: [maliciousId],
      edges: [{ from: maliciousId, to: END }],
      conditionalEdges: [],
    };
    const html = renderTraceHtml(evil);
    expect(html).not.toContain(maliciousId);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
