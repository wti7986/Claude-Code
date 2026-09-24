import "dotenv/config";
import cors from "cors";
import express from "express";
import { suggestCorrection } from "./correction.js";
import { splitSentences } from "./sentenceSplit.js";
import { screenSentences } from "./typesafeCheck.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const THRESHOLD = Number(process.env.TYPO_FLAG_THRESHOLD ?? 0.5);

interface CheckResultSentence {
  index: number;
  text: string;
  start: number;
  end: number;
  probability: number;
  flagged: boolean;
  suggestion?: {
    corrected: string;
    issues: { original: string; suggestion: string; reason: string }[];
  };
  // Jev flagged this sentence but the Claude correction call failed
  // (missing key, rate limit, timeout, ...) - distinct from Claude
  // having looked and found nothing wrong.
  correctionUnavailable?: boolean;
}

app.post("/api/check", async (req, res) => {
  const text = req.body?.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  try {
    const sentences = splitSentences(text);
    const screening = await screenSentences(sentences);
    const screeningByIndex = new Map(screening.map((s) => [s.index, s]));

    const flagged = screening.filter((s) => s.probability >= THRESHOLD);

    const corrections = await Promise.all(
      flagged.map(async (f) => {
        const sentence = sentences[f.index];
        try {
          const correction = await suggestCorrection(sentence.text);
          return { index: f.index, correction };
        } catch (err) {
          // A screening flag is still useful without a suggestion - don't let
          // one failed correction call (missing key, rate limit, timeout)
          // take down results for every other sentence in the request.
          console.error(`correction failed for sentence ${f.index}:`, err);
          return { index: f.index, correction: null };
        }
      }),
    );
    const correctionByIndex = new Map(corrections.map((c) => [c.index, c.correction]));

    const results: CheckResultSentence[] = sentences.map((s) => {
      const screened = screeningByIndex.get(s.index)!;
      const flagged = screened.probability >= THRESHOLD;
      const correction = correctionByIndex.get(s.index);
      return {
        index: s.index,
        text: s.text,
        start: s.start,
        end: s.end,
        probability: screened.probability,
        flagged,
        suggestion:
          correction && correction.hasError
            ? { corrected: correction.corrected, issues: correction.issues }
            : undefined,
        correctionUnavailable: flagged && correction === null,
      };
    });

    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT ?? 3300);
app.listen(port, () => {
  console.log(`typo-checker server listening on :${port}`);
});
