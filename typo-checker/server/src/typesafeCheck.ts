import { TypeSafeClient, noul, type NoulQuestion } from "@typesafe-ai/sdk";
import type { Sentence } from "./sentenceSplit.js";

const typesafe = new TypeSafeClient(); // reads TYPESAFE_API_KEY

export interface ScreeningResult {
  index: number;
  probability: number;
}

/**
 * Fast, cheap pass: ask Jev one Noul (yes/no probability) question per
 * sentence, all in a single batched request. This is the "instant" gate -
 * only sentences that come back above the threshold go on to the slower
 * Claude correction step.
 */
export async function screenSentences(
  sentences: Sentence[],
): Promise<ScreeningResult[]> {
  if (sentences.length === 0) return [];

  const state = {
    sentences: sentences.map((s) => s.text),
  };

  const questions: Record<string, NoulQuestion> = {};
  for (const s of sentences) {
    questions[`s${s.index}`] = noul(
      `\`sentences[${s.index}]\` は、日本語の文章として誤字・脱字・誤変換（キー入力ミスや変換ミス）を含んでいる可能性が高いか。話し言葉的な言い回し、意図的な省略、方言、絵文字、単なる文体の好みは誤りとみなさない。`,
    );
  }

  const result = await typesafe.systemOne({ state, questions });

  return sentences.map((s) => ({
    index: s.index,
    probability: result.answers[`s${s.index}`].noul,
  }));
}
