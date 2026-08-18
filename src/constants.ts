/**
 * START/END are unique symbols, not the strings "start"/"end".
 *
 * Why: node ids are arbitrary strings chosen by whoever builds a graph. If
 * END were the string "end", a user naming a node "end" would silently
 * collide with the framework's own sentinel. Symbols can never collide with
 * a user-chosen string, so the type system rules this bug class out entirely
 * instead of relying on a naming convention nobody reads.
 */
export const END = Symbol("agent-mesh/end");

export type NodeId = string;
export type EdgeTarget = NodeId | typeof END;
