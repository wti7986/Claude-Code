export interface Sentence {
  index: number;
  text: string;
  start: number;
  end: number;
}

/**
 * Splits Japanese text into sentence-ish chunks, keeping the closing
 * punctuation attached and preserving offsets into the original string
 * so callers can locate/replace a flagged chunk exactly.
 */
export function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  const re = /[^。！？\n]+[。！？]?|\n+/g;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = re.exec(text)) !== null) {
    const raw = match[0];
    if (raw.trim().length === 0) continue;
    sentences.push({
      index: index++,
      text: raw,
      start: match.index,
      end: match.index + raw.length,
    });
  }

  return sentences;
}
