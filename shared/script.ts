export function normalizeText(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}
export function tokenize(text: string): string[] {
  return (
    text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? []
  );
}
export interface Word {
  text: string;
  normalized: string;
  index: number;
  paragraph: number;
}
export function scriptWords(text: string): Word[][] {
  let index = 0;
  return normalizeText(text)
    .split(/\n\s*\n/)
    .map((paragraph, p) =>
      (
        paragraph.match(
          /[\p{L}\p{N}]+(?:['’‘][\p{L}\p{N}]+)*|[^\p{L}\p{N}]+/gu,
        ) ?? []
      ).map((text) => {
        const normalized = tokenize(text).join("");
        return {
          text,
          normalized,
          index: normalized ? index++ : -1,
          paragraph: p,
        };
      }),
    );
}
// Local phrase alignment tolerates omissions, but requires a distinctive multi-word match.
export function matchSpeech(
  script: string[],
  speech: string,
  current: number,
): number | null {
  const tokens = tokenize(speech).slice(-14);
  if (tokens.length < 3) return null;
  const start = Math.max(0, current - 10),
    end = Math.min(script.length, current + 65);
  const candidates: { position: number; score: number; matches: number }[] = [];
  for (let offset = start; offset < end; offset++) {
    let at = offset,
      matches = 0,
      skipped = 0;
    for (const word of tokens) {
      let found = -1;
      for (let j = at; j < Math.min(at + 4, end); j++)
        if (script[j] === word) {
          found = j;
          break;
        }
      if (found >= 0) {
        skipped += found - at;
        matches++;
        at = found + 1;
      }
    }
    if (matches >= 3 && matches / tokens.length >= 0.65)
      candidates.push({
        position: at - 1,
        score: matches * 3 - skipped * 0.7 - Math.abs(offset - current) * 0.035,
        matches,
      });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return null;
  const competing = candidates.find(
    (c) => Math.abs(c.position - best.position) > 5,
  );
  if (
    competing &&
    best.score - competing.score < 1.2 &&
    best.position - current > 5
  )
    return null;
  // Repeating or correcting nearby words never makes the display jump backwards.
  return Math.max(current, best.position);
}
