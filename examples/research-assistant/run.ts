import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderTraceHtml } from "../../src/index.js";
import { createGeminiLLM } from "./gemini-client.js";
import { buildResearchGraph } from "./graph.js";

/**
 * Loads examples/research-assistant/.env into process.env using Node's
 * built-in loader (stable since Node 20.12 / 21.7 — no need for the
 * `dotenv` package as a dependency just for this).
 *
 * Why not crash if .env is missing: the user might export GEMINI_API_KEY in
 * their shell instead of using a file. The real "did we get a key or not"
 * check happens right after, with a message that explains both options.
 */
try {
  process.loadEnvFile(new URL(".env", import.meta.url));
} catch {
  // No .env file present — fall through to the explicit check below.
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Copy examples/research-assistant/.env.example to " +
        "examples/research-assistant/.env and fill in your key from https://aistudio.google.com/apikey " +
        "(or export GEMINI_API_KEY in your shell).",
    );
  }

  const topic = process.argv[2] ?? "O impacto de agentes de IA autônomos no mercado de trabalho de TI";

  // Build the options object conditionally instead of `model:
  // process.env.GEMINI_MODEL` directly: an unset env var reads back as
  // undefined, but "GEMINI_MODEL=" with nothing after the "=" in a .env
  // file reads back as an empty string — which is a valid `string`, so
  // `?? "default"` would never catch it and the SDK would receive model:
  // "" and reject it. Treating both "unset" and "empty" as "not provided"
  // is what the user actually means by leaving the line blank.
  const modelOverride = process.env.GEMINI_MODEL;
  const llm = createGeminiLLM(modelOverride ? { apiKey, model: modelOverride } : { apiKey });
  const graph = buildResearchGraph();

  console.log(`\nTema: ${topic}\n`);
  console.log("Executando planner → researcher → writer → critic ...\n");

  const result = await graph.invoke({ topic, revisionCount: 0 }, { llm });

  console.log("--- Rascunho final ---\n");
  console.log(result.finalState.draft);

  console.log("\n--- Trace de execução ---");
  for (const step of result.trace) {
    console.log(`  ${step.node.padEnd(10)} ${step.durationMs}ms`);
  }
  console.log(`\nTotal de passos: ${result.steps}, revisões: ${result.finalState.revisionCount}`);

  // graph.describe() exposes the validated topology (Decision 12 in the
  // conversation this was built in) — renderTraceHtml draws it once and
  // overlays exactly the path this run took, straight from `result.trace`.
  const html = renderTraceHtml(graph.describe(), result, {
    title: `Agent Mesh — ${topic}`,
  });
  const outputUrl = new URL("trace.html", import.meta.url);
  await writeFile(outputUrl, html, "utf-8");
  // fileURLToPath, not outputUrl.pathname directly: pathname is
  // percent-encoded (spaces become %20, accented characters become
  // %XX sequences), which is correct for a URL but useless as a path to
  // hand back to the user to open — this repo's own folder name has both.
  console.log(`\nVisualização salva em: ${fileURLToPath(outputUrl)}`);
}

main().catch((error: unknown) => {
  console.error("\nFalhou:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
