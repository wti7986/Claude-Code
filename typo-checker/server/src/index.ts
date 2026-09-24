import "dotenv/config";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import { requireSharedToken } from "./auth.js";
import { splitSentences } from "./sentenceSplit.js";
import { screenSentences } from "./typesafeCheck.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const THRESHOLD = Number(process.env.TYPO_FLAG_THRESHOLD ?? 0.5);

const checkLimiter = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate limit exceeded, try again shortly" },
});

interface CheckResultSentence {
  index: number;
  text: string;
  start: number;
  end: number;
  probability: number;
  flagged: boolean;
}

app.post("/api/check", requireSharedToken, checkLimiter, async (req, res) => {
  const text = req.body?.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  try {
    const sentences = splitSentences(text);
    const screening = await screenSentences(sentences);
    const screeningByIndex = new Map(screening.map((s) => [s.index, s]));

    const results: CheckResultSentence[] = sentences.map((s) => {
      const screened = screeningByIndex.get(s.index)!;
      return {
        index: s.index,
        text: s.text,
        start: s.start,
        end: s.end,
        probability: screened.probability,
        flagged: screened.probability >= THRESHOLD,
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
