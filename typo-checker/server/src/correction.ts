import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const CorrectionSchema = z.object({
  hasError: z.boolean(),
  corrected: z.string(),
  issues: z.array(
    z.object({
      original: z.string(),
      suggestion: z.string(),
      reason: z.string(),
    }),
  ),
});

export type Correction = z.infer<typeof CorrectionSchema>;

/**
 * Slower, higher-quality pass: only called for sentences Jev already
 * flagged as likely to contain an error. Jev returns probabilities, not
 * text, so generating the actual corrected sentence needs a generative
 * model - this is the "Verify and escalate" half of the pipeline.
 */
export async function suggestCorrection(sentence: string): Promise<Correction> {
  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 2048,
    system:
      "あなたは日本語のビジネス文書の校正者です。渡された1文について、誤字・脱字・誤変換・タイプミスのみを指摘してください。" +
      "文体、敬語の丁寧さ、言い回しの好みは指摘しないでください。誤りがなければ hasError を false にし、" +
      "corrected には入力と同じ文をそのまま返してください。",
    messages: [{ role: "user", content: sentence }],
    output_config: { format: zodOutputFormat(CorrectionSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("correction: failed to parse structured output");
  }
  return response.parsed_output;
}
