import { END, type NodeId } from "../constants.js";
import type { ExecutionResult, GraphDescription } from "../types.js";
import { computeLayout, NODE_HEIGHT, NODE_WIDTH, type Layout } from "./layout.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface EdgeToRender {
  from: NodeId;
  to: NodeId | typeof END;
  label: string | undefined;
}

function allEdges(description: GraphDescription): EdgeToRender[] {
  const edges: EdgeToRender[] = description.edges.map((e) => ({
    from: e.from,
    to: e.to,
    label: undefined,
  }));
  for (const conditional of description.conditionalEdges) {
    for (const c of conditional.cases) {
      edges.push({ from: conditional.from, to: c.to, label: c.key });
    }
  }
  return edges;
}

/** Which edges did this specific run actually cross, and on which step
 * number(s)? A trace of N steps crosses N transitions: step i → step i+1,
 * and the last step → END (invoke() only returns once it reaches END). */
function findExecutedTransitions<TState>(
  result: ExecutionResult<TState>,
): Map<string, number[]> {
  const usedAt = new Map<string, number[]>();
  for (let i = 0; i < result.trace.length; i++) {
    const step = result.trace[i];
    if (!step) continue;
    const from = step.node;
    const nextStep = result.trace[i + 1];
    const to: NodeId | typeof END = nextStep ? nextStep.node : END;
    const key = `${from}::${String(to)}`;
    const orders = usedAt.get(key) ?? [];
    orders.push(i + 1);
    usedAt.set(key, orders);
  }
  return usedAt;
}

function nodeBoxSvg(id: string, x: number, y: number, executed: boolean, isEnd: boolean): string {
  const cssClass = isEnd ? "node node-end" : executed ? "node node-executed" : "node node-idle";
  return `
    <g class="${cssClass}">
      <rect x="${x}" y="${y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="8" />
      <text x="${x + NODE_WIDTH / 2}" y="${y + NODE_HEIGHT / 2}" text-anchor="middle" dominant-baseline="middle">${escapeHtml(id)}</text>
    </g>`;
}

function edgeSvg(edge: EdgeToRender, layout: Layout, orders: number[] | undefined): string {
  const from = layout.positions.get(edge.from);
  const to = layout.positions.get(edge.to);
  if (!from || !to) return "";

  const executed = orders !== undefined;
  const cssClass = executed ? "edge edge-executed" : "edge edge-idle";
  const isBackEdge = to.x <= from.x;

  const startX = from.x + NODE_WIDTH;
  const startY = from.y + NODE_HEIGHT / 2;
  const endX = to.x;
  const endY = to.y + NODE_HEIGHT / 2;

  let path: string;
  let labelX: number;
  let labelY: number;

  if (isBackEdge) {
    // Loops out the bottom of `from` and back into the bottom of `to`,
    // so a return edge (e.g. critic → writer) reads as visually distinct
    // from the main left-to-right flow instead of overlapping it.
    const dipY = Math.max(from.y, to.y) + NODE_HEIGHT + 40;
    const midStartX = from.x + NODE_WIDTH / 2;
    const midEndX = to.x + NODE_WIDTH / 2;
    path = `M ${midStartX} ${from.y + NODE_HEIGHT} C ${midStartX} ${dipY}, ${midEndX} ${dipY}, ${midEndX} ${to.y + NODE_HEIGHT}`;
    labelX = (midStartX + midEndX) / 2;
    labelY = dipY + 14;
  } else {
    path = `M ${startX} ${startY} L ${endX} ${endY}`;
    labelX = (startX + endX) / 2;
    labelY = (startY + endY) / 2 - 8;
  }

  const markerId = executed ? "arrow-executed" : "arrow-idle";
  // `orders !== undefined` (not the `executed` boolean) is what TypeScript
  // needs to see right here to narrow `orders` from `number[] | undefined`
  // to `number[]` — going through the intermediate `executed` variable
  // loses that connection for the type checker, even though it's the same
  // condition at runtime.
  const labelText = [edge.label, orders !== undefined ? `#${orders.join(",")}` : undefined]
    .filter(Boolean)
    .join(" · ");

  const label = labelText
    ? `<text class="edge-label" x="${labelX}" y="${labelY}" text-anchor="middle">${escapeHtml(labelText)}</text>`
    : "";

  return `
    <g class="${cssClass}">
      <path d="${path}" fill="none" marker-end="url(#${markerId})" />
      ${label}
    </g>`;
}

/** Builds the inline SVG diagram: the full static graph, with nodes/edges
 * an actual run crossed drawn in the accent style and everything else
 * muted — see the module doc comment in index.ts for the design rationale. */
export function buildGraphSvg<TState>(
  description: GraphDescription,
  result: ExecutionResult<TState> | undefined,
): string {
  const layout = computeLayout(description);
  const executedTransitions = result ? findExecutedTransitions(result) : new Map<string, number[]>();
  const executedNodes = new Set<string>(result ? result.trace.map((s) => s.node) : []);
  const reachedEnd = result !== undefined; // invoke() only resolves once END is reached

  const edgesSvg = allEdges(description)
    .map((edge) => edgeSvg(edge, layout, executedTransitions.get(`${edge.from}::${String(edge.to)}`)))
    .join("\n");

  const nodesSvg = description.nodes
    .map((id) => {
      const pos = layout.positions.get(id);
      if (!pos) return "";
      return nodeBoxSvg(id, pos.x, pos.y, executedNodes.has(id), false);
    })
    .join("\n");

  const endPos = layout.positions.get(END);
  const endSvg = endPos ? nodeBoxSvg("END", endPos.x, endPos.y, reachedEnd, true) : "";

  return `
<svg viewBox="0 0 ${layout.width} ${layout.height + 60}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Agent Mesh execution graph">
  <defs>
    <marker id="arrow-idle" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" class="marker-idle" />
    </marker>
    <marker id="arrow-executed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" class="marker-executed" />
    </marker>
  </defs>
  ${edgesSvg}
  ${nodesSvg}
  ${endSvg}
</svg>`;
}

function traceTableHtml<TState>(result: ExecutionResult<TState>): string {
  const rows = result.trace
    .map(
      (step, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(step.node)}</td>
        <td>${step.durationMs}ms</td>
      </tr>`,
    )
    .join("");

  return `
  <table>
    <thead><tr><th>#</th><th>Node</th><th>Duration</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export interface RenderTraceHtmlOptions {
  title?: string;
}

/**
 * Produces one self-contained HTML file (inline CSS, no external requests,
 * dark-mode aware via prefers-color-scheme) showing the graph's full shape
 * with the actual path a run took highlighted on top of it.
 *
 * `result` is optional: pass it to visualize one run, or omit it to render
 * just the graph's static shape (e.g. for documentation) with nothing
 * highlighted.
 */
export function renderTraceHtml<TState>(
  description: GraphDescription,
  result?: ExecutionResult<TState>,
  options: RenderTraceHtmlOptions = {},
): string {
  const title = options.title ?? "Agent Mesh — execution graph";
  const svg = buildGraphSvg(description, result);
  const table = result ? traceTableHtml(result) : "";
  const summary = result
    ? `<p>${result.steps} steps executed.</p>`
    : `<p>Static graph shape — no run attached.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg: #ffffff; --fg: #1a1a1a; --muted: #9a9a9a; --muted-fill: #f2f2f2;
    --accent: #2563eb; --accent-fill: #dbeafe; --border: #e2e2e2;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14161a; --fg: #e8e8e8; --muted: #6b7280; --muted-fill: #1f2329;
      --accent: #60a5fa; --accent-fill: #1e3a5f; --border: #2a2e35;
    }
  }
  body { background: var(--bg); color: var(--fg); font-family: system-ui, sans-serif; margin: 0; padding: 24px; }
  h1 { font-size: 1.1rem; font-weight: 600; }
  svg { max-width: 100%; height: auto; display: block; margin: 16px 0; }
  .node rect { stroke-width: 1.5; }
  .node text { font-size: 13px; font-family: inherit; }
  .node-idle rect { fill: var(--muted-fill); stroke: var(--border); }
  .node-idle text { fill: var(--muted); }
  .node-executed rect { fill: var(--accent-fill); stroke: var(--accent); }
  .node-executed text { fill: var(--fg); font-weight: 600; }
  .node-end rect { rx: 25; }
  .edge path { stroke-width: 1.5; }
  .edge-idle path { stroke: var(--border); stroke-dasharray: 4 3; }
  .edge-executed path { stroke: var(--accent); stroke-width: 2; }
  .edge-label { font-size: 11px; fill: var(--muted); font-family: inherit; }
  .edge-executed .edge-label { fill: var(--accent); font-weight: 600; }
  .marker-idle { fill: var(--border); }
  .marker-executed { fill: var(--accent); }
  table { border-collapse: collapse; margin-top: 16px; font-size: 13px; }
  th, td { border: 1px solid var(--border); padding: 4px 10px; text-align: left; }
  th { background: var(--muted-fill); }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${summary}
  ${svg}
  ${table}
</body>
</html>`;
}
