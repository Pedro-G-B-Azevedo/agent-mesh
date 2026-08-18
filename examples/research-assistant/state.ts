/**
 * State that flows through the 4 agents. Every field beyond `topic` and
 * `revisionCount` is optional because it doesn't exist yet until the node
 * that produces it has run — the type makes "not computed yet" explicit
 * instead of every field being a lie about what's actually available.
 */
export interface ResearchState extends Record<string, unknown> {
  topic: string;
  plan?: string;
  research?: string;
  draft?: string;
  critique?: string;
  approved?: boolean;
  revisionCount: number;
}

export const MAX_REVISIONS = 2;
