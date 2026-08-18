import type { NodeHandler } from "../../src/index.js";
import { MAX_REVISIONS, type ResearchState } from "./state.js";

/**
 * Each function below is a NodeHandler<ResearchState>: it receives the
 * current state and the shared ExecutionContext (which carries `llm`), and
 * returns only the fields it changed. None of them know or care whether
 * `ctx.llm` is the real Gemini client or the mock from src/llm/mock-llm.ts —
 * that's the whole point of the interface boundary from Decision 8.
 */

export const plannerNode: NodeHandler<ResearchState> = async (state, ctx) => {
  const plan = await ctx.llm.complete(
    `Você é um planejador de pesquisa. Dado o tema "${state.topic}", produza um plano curto ` +
      `(3 a 5 tópicos) do que precisa ser investigado e qual deve ser o argumento central do ` +
      `relatório final. Responda apenas com o plano, sem introdução.`,
  );
  return { plan };
};

export const researcherNode: NodeHandler<ResearchState> = async (state, ctx) => {
  const research = await ctx.llm.complete(
    `Você é um pesquisador. Com base neste plano:\n${state.plan}\n\n` +
      `Produza uma síntese dos pontos-chave (fatos, argumentos, contexto) que sustentam cada ` +
      `tópico do plano. Baseie-se em conhecimento geral — não invente fontes ou estatísticas ` +
      `específicas que não seja capaz de sustentar.`,
  );
  return { research };
};

export const writerNode: NodeHandler<ResearchState> = async (state, ctx) => {
  const revisionNote = state.critique
    ? `\n\nRevise o relatório considerando esta crítica da versão anterior:\n${state.critique}`
    : "";

  const draft = await ctx.llm.complete(
    `Você é um redator técnico. Escreva um relatório curto (3 a 4 parágrafos) sobre ` +
      `"${state.topic}", usando este plano:\n${state.plan}\n\ne esta pesquisa:\n${state.research}` +
      revisionNote,
  );
  return { draft };
};

export const criticNode: NodeHandler<ResearchState> = async (state, ctx) => {
  const response = await ctx.llm.complete(
    `Você é um crítico exigente revisando um rascunho de relatório sobre "${state.topic}":\n\n` +
      `${state.draft}\n\nResponda EXATAMENTE neste formato, sem nada antes ou depois:\n` +
      `VEREDITO: APROVADO ou VEREDITO: REVISAR\nFEEDBACK: <1 a 2 frases explicando o motivo>`,
  );

  const revisionCount = state.revisionCount;
  const criticApproved = /VEREDITO:\s*APROVADO/i.test(response);
  const feedback = response.match(/FEEDBACK:\s*(.*)/is)?.[1]?.trim();

  // Soft stop condition (see Decision 9): after MAX_REVISIONS the critic
  // stops blocking even if it still isn't fully satisfied, so a normal run
  // always converges instead of depending on the executor's hard maxSteps
  // guard to end things.
  const forcedByRevisionCap = !criticApproved && revisionCount >= MAX_REVISIONS;
  const approved = criticApproved || forcedByRevisionCap;

  const update: Partial<ResearchState> = {
    approved,
    revisionCount: approved ? revisionCount : revisionCount + 1,
  };
  if (!approved) {
    update.critique = feedback ?? "Sem feedback específico retornado pelo crítico.";
  }
  return update;
};

/** Decides the conditional edge out of "critic": back to "writer" for
 * another pass, or to END once approved (by the critic itself, or by the
 * revision cap in criticNode above). */
export function routeAfterCritic(state: ResearchState): "approved" | "revise" {
  return state.approved ? "approved" : "revise";
}
