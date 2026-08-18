import { GoogleGenAI } from "@google/genai";
import type { LLMClient } from "../../src/index.js";

/**
 * Concrete LLMClient backed by Google's Gemini API.
 *
 * Why this file lives under examples/ and not src/llm/: see the README —
 * the point is that this is *one interchangeable implementation* of the
 * same LLMClient interface the mock in src/llm/mock-llm.ts implements. The
 * graph and every agent node in this example only ever talk to the
 * `LLMClient` interface; swapping this for a Claude or OpenAI adapter later
 * would mean writing one new file like this one, not touching agents.ts.
 */
export function createGeminiLLM(options: { apiKey: string; model?: string }): LLMClient {
  const ai = new GoogleGenAI({ apiKey: options.apiKey });
  const model = options.model ?? "gemini-2.5-flash";

  return {
    async complete(prompt, opts) {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { temperature: opts?.temperature },
      });
      // `.text` is typed as `string | undefined` (the SDK can't guarantee a
      // response was produced, e.g. if content was blocked by safety
      // filters) — surface that as a loud error instead of silently
      // returning "" and letting a garbage empty draft flow downstream.
      if (response.text === undefined) {
        throw new Error(
          "Gemini returned no text (the response may have been blocked by safety filters).",
        );
      }
      return response.text;
    },
  };
}
