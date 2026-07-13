import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AiPreRouterDecision } from "./songRequestSchema";

export type AngklobotKnowledgeSection =
  | "angklobot-persona"
  | "angklung-basics"
  | "machine-architecture"
  | "rack-and-validation"
  | "song-library-rules"
  | "midi-conversion-process"
  | "wro-demo-explanation";

export type AngklobotKnowledgeContext = {
  content: string;
  sections: AngklobotKnowledgeSection[];
};

const SECTION_FILES: Record<AngklobotKnowledgeSection, string> = {
  "angklobot-persona": "angklobot-persona.md",
  "angklung-basics": "angklung-basics.md",
  "machine-architecture": "machine-architecture.md",
  "rack-and-validation": "rack-and-validation.md",
  "song-library-rules": "song-library-rules.md",
  "midi-conversion-process": "midi-conversion-process.md",
  "wro-demo-explanation": "wro-demo-explanation.md",
};

export async function retrieveAngklobotKnowledge(
  message: string,
  preRouterDecision: AiPreRouterDecision | null,
): Promise<AngklobotKnowledgeContext> {
  const normalized = message.toLowerCase();
  const sections = new Set<AngklobotKnowledgeSection>(["angklobot-persona"]);

  if (/\bangklung\b|bamboo instrument|traditional instrument/.test(normalized)) sections.add("angklung-basics");
  if (/machine|robot|angklobot|how (do|does)|architecture|motor|actuator|system work/.test(normalized)) sections.add("machine-architecture");
  if (/why (can|can t|can't|cannot)|unsupported|limitation|rack|note range|sharp|flat|validation|safe/.test(normalized)) {
    sections.add("rack-and-validation");
    sections.add("song-library-rules");
  }
  if (/midi|musicxml|music xml|conversion|convert|transpose|transposition|pdf|arrangement/.test(normalized)) {
    sections.add("midi-conversion-process");
    sections.add("rack-and-validation");
  }
  if (/\bwro\b|\bproject\b|judge|demo|what makes this ai|what makes this robotics|youtube|future feature|offline|local ollama/.test(normalized)) {
    sections.add("wro-demo-explanation");
    sections.add("machine-architecture");
  }
  if (
    /song|music|play|library|catalog|recommend|suggest|genre|mood|artist/.test(normalized) ||
    preRouterDecision === "exact_catalog_match" ||
    preRouterDecision === "list_songs" ||
    preRouterDecision === "catalog_recommendation" ||
    preRouterDecision === "unsupported_song"
  ) {
    sections.add("song-library-rules");
  }
  if (preRouterDecision === "machine_question") sections.add("machine-architecture");
  if (preRouterDecision === "angklung_question") sections.add("angklung-basics");
  if (preRouterDecision === "limitation_explanation") {
    sections.add("rack-and-validation");
    sections.add("song-library-rules");
  }

  const selected = Array.from(sections).slice(0, 4);
  const entries = await Promise.all(selected.map(async (section) => ({ section, text: await loadKnowledgeSection(section) })));
  const content = entries
    .map(({ section, text }) => `## ${section}\n${text.slice(0, 2200)}`)
    .join("\n\n")
    .slice(0, 7000);

  return { content, sections: selected };
}

async function loadKnowledgeSection(section: AngklobotKnowledgeSection): Promise<string> {
  const roots = [path.resolve(process.cwd(), "../docs/ai/knowledge"), path.resolve(process.cwd(), "docs/ai/knowledge")];
  for (const root of roots) {
    try {
      const text = await readFile(path.join(root, SECTION_FILES[section]), "utf8");
      const normalized = text.replace(/^# .+\n+/, "").trim();
      return normalized;
    } catch {
      // Try the next repository layout.
    }
  }
  return "";
}
