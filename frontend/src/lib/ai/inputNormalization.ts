const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};

const COMMON_TRANSCRIPT_WORDS: Record<string, string> = {
  paly: "play",
  plya: "play",
  sotp: "stop",
  waht: "what",
};

/** Normalize speech/text without deleting meaningful repeated words inside a sentence. */
export function normalizeVisitorInput(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  const segments = trimmed.split(/(?<=[.!?])\s+/).map((segment) => segment.trim()).filter(Boolean);
  if (segments.length > 1) {
    const keys = segments.map(normalizeForMatching);
    if (keys.every((key) => key === keys[0])) return segments[0].replace(/[.!?]+$/, "");
  }

  // Whisper can concatenate the same complete utterance with punctuation removed.
  const words = trimmed.split(" ");
  for (let blockSize = 1; blockSize <= Math.floor(words.length / 2); blockSize += 1) {
    if (words.length % blockSize !== 0) continue;
    const first = normalizeForMatching(words.slice(0, blockSize).join(" "));
    const blocks = words.length / blockSize;
    if (blocks >= 2 && Array.from({ length: blocks }, (_, index) =>
      normalizeForMatching(words.slice(index * blockSize, (index + 1) * blockSize).join(" ")),
    ).every((block) => block === first)) return words.slice(0, blockSize).join(" ").replace(/[.!?]+$/, "");
  }

  return trimmed;
}

export function normalizeForMatching(value: string): string {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/(\d)(?=\d)/g, "$1 ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  return normalized.split(" ").map((word) => NUMBER_WORDS[word] ?? COMMON_TRANSCRIPT_WORDS[word] ?? word).join(" ");
}

export function compactForMatching(value: string): string {
  return normalizeForMatching(value).replace(/\s+/g, "");
}
