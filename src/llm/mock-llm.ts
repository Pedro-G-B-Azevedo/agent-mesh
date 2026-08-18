import type { LLMClient } from "../types.js";

/**
 * A deterministic, zero-cost stand-in for a real LLM.
 *
 * Why build this before any real provider adapter: it lets every node and
 * every graph-shape (linear, branching, looping) get tested against
 * predictable output with zero network calls, zero API cost, and zero
 * flakiness from a real model's non-determinism. The real Gemini adapter
 * (added next) implements the exact same `LLMClient` interface, so tests
 * written against this mock keep working unchanged once a real provider is
 * plugged in — that's the payoff of the provider-agnostic core.
 */
export function createMockLLM(script: string[] | ((prompt: string) => string)): LLMClient {
  let callIndex = 0;

  return {
    async complete(prompt: string): Promise<string> {
      if (typeof script === "function") {
        return script(prompt);
      }
      const response = script[callIndex % script.length] ?? "";
      callIndex += 1;
      return response;
    },
  };
}
