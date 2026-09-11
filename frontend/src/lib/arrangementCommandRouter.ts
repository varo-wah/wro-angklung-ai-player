import { normalizeForMatching, normalizeVisitorInput } from "./ai/inputNormalization";
import type { ArrangementSettings } from "./scheduleBuilder";

/** Match setting commands, not song titles or questions mentioning melody. */
export function routeArrangementCommand(message: string): ArrangementSettings["mode"] | null {
  const text = normalizeForMatching(normalizeVisitorInput(message))
    .replace(/^(?:please |can you |could you )/, "")
    .replace(/^(?:switch to |change to |set to |use |play |switch |change |set )/, "")
    .replace(/(?: mode)?(?: please)?$/, "").trim();
  if (["melody", "melody only", "just melody", "just the melody", "only melody", "melodi", "melodi saja", "tanpa pengiring"].includes(text)) return "melody";
  if (["extra", "with extra", "melody with extra", "melody and extra", "harmony", "add accompaniment", "with accompaniment", "melodi dengan pengiring"].includes(text)) return "harmony";
  return null;
}
