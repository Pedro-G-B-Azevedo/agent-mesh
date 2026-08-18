import { END, type NodeId } from "../constants.js";
import type { GraphDescription } from "../types.js";

export interface NodePosition {
  x: number;
  y: number;
}

export interface Layout {
  positions: Map<NodeId | typeof END, NodePosition>;
  width: number;
  height: number;
}

const COLUMN_WIDTH = 200;
const ROW_HEIGHT = 90;
const NODE_MARGIN = 60;

// Exported so render.ts draws boxes that match the spacing this module
// assumed while computing positions, instead of duplicating these numbers
// and risking them drifting apart.
export const NODE_WIDTH = 140;
export const NODE_HEIGHT = 50;

/** All (node -> next node) targets reachable from `from`, END excluded —
 * used only to walk the graph for layering, never to render an edge. */
function outgoingRealTargets(description: GraphDescription, from: NodeId): NodeId[] {
  const targets: NodeId[] = [];
  const staticEdge = description.edges.find((e) => e.from === from);
  if (staticEdge && staticEdge.to !== END) targets.push(staticEdge.to);

  const conditional = description.conditionalEdges.find((e) => e.from === from);
  if (conditional) {
    for (const { to } of conditional.cases) {
      if (to !== END) targets.push(to);
    }
  }
  return targets;
}

/**
 * Assigns each node a layer = its distance (in hops) from the entry point,
 * found via BFS. A node keeps the layer it was FIRST reached at — so a
 * back edge (e.g. critic → writer, discovered again later at a deeper BFS
 * level) never overrides writer's original, earlier layer. That's what
 * keeps this safe against cycles instead of looping forever.
 */
function computeLayers(description: GraphDescription): Map<NodeId, number> {
  const layer = new Map<NodeId, number>();
  layer.set(description.entryPoint, 0);
  const queue: NodeId[] = [description.entryPoint];

  while (queue.length > 0) {
    const current = queue.shift() as NodeId;
    const currentLayer = layer.get(current) as number;
    for (const next of outgoingRealTargets(description, current)) {
      if (!layer.has(next)) {
        layer.set(next, currentLayer + 1);
        queue.push(next);
      }
    }
  }
  return layer;
}

/** Does any real edge (static or conditional) reach END? If so END gets
 * drawn as its own final column, one layer past the deepest real node. */
function hasEndTarget(description: GraphDescription): boolean {
  const staticHasEnd = description.edges.some((e) => e.to === END);
  const conditionalHasEnd = description.conditionalEdges.some((e) =>
    e.cases.some((c) => c.to === END),
  );
  return staticHasEnd || conditionalHasEnd;
}

export function computeLayout(description: GraphDescription): Layout {
  const layers = computeLayers(description);

  const nodesByLayer = new Map<number, NodeId[]>();
  for (const node of description.nodes) {
    const l = layers.get(node) ?? 0;
    const bucket = nodesByLayer.get(l) ?? [];
    bucket.push(node);
    nodesByLayer.set(l, bucket);
  }

  const maxLayer = Math.max(0, ...[...layers.values()]);
  const maxNodesInAnyLayer = Math.max(1, ...[...nodesByLayer.values()].map((b) => b.length));

  const positions = new Map<NodeId | typeof END, NodePosition>();
  for (const [layerIndex, nodes] of nodesByLayer) {
    nodes.forEach((node, i) => {
      positions.set(node, {
        x: NODE_MARGIN + layerIndex * COLUMN_WIDTH,
        y: NODE_MARGIN + i * ROW_HEIGHT,
      });
    });
  }

  let endLayer = maxLayer;
  if (hasEndTarget(description)) {
    endLayer = maxLayer + 1;
    positions.set(END, {
      x: NODE_MARGIN + endLayer * COLUMN_WIDTH,
      y: NODE_MARGIN + Math.floor((maxNodesInAnyLayer - 1) / 2) * ROW_HEIGHT,
    });
  }

  return {
    positions,
    width: NODE_MARGIN * 2 + endLayer * COLUMN_WIDTH,
    height: NODE_MARGIN * 2 + (maxNodesInAnyLayer - 1) * ROW_HEIGHT,
  };
}
