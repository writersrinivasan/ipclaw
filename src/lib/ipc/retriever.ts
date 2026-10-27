import { IPC_SECTIONS, getSection } from "./sections";
import type { IpcSection } from "./types";

const STOP = new Set(
  "a an and are as at be by for from has have he her his i if in is it its my of on or our she that the their there these they this to was we were what when which who will with you your under section sections ipc law india indian punishment can does do did would could should about bailable bail cognizable compoundable punishable offence offense apply applies".split(" "),
);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9₹\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

/** Very light stemmer so "stealing"/"stolen"/"steal" roughly collapse. */
function stem(w: string): string {
  return w
    .replace(/ies$/, "y")
    .replace(/(ing|ed|es|s)$/, "")
    .replace(/(ation|ment)$/, "");
}

interface Doc {
  section: IpcSection;
  tf: Map<string, number>;
  len: number;
}

const DOCS: Doc[] = IPC_SECTIONS.map((s) => {
  const text = [
    s.title,
    s.title, // title weighted twice
    s.summary,
    s.ingredients.join(" "),
    s.industrialNote ?? "",
    s.keywords.join(" "),
    s.keywords.join(" "),
    s.keywords.join(" "), // keywords weighted thrice
  ].join(" ");
  const toks = tokenize(text);
  const tf = new Map<string, number>();
  for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
  return { section: s, tf, len: toks.length };
});

const AVG_LEN = DOCS.reduce((a, d) => a + d.len, 0) / DOCS.length;
const DF = new Map<string, number>();
for (const d of DOCS) for (const t of d.tf.keys()) DF.set(t, (DF.get(t) ?? 0) + 1);

function idf(term: string): number {
  const n = DOCS.length;
  const df = DF.get(term) ?? 0;
  return Math.log(1 + (n - df + 0.5) / (df + 0.5));
}

const MIN_SCORE = 3.5;

export interface RetrievalHit {
  section: IpcSection;
  score: number;
  reason: "explicit" | "semantic";
}

/** BM25 scoring over the curated corpus. */
export function searchSections(query: string, k = 6): RetrievalHit[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const k1 = 1.4;
  const b = 0.75;
  const scored = DOCS.map((d) => {
    let score = 0;
    for (const t of new Set(terms)) {
      const f = d.tf.get(t) ?? 0;
      if (!f) continue;
      score += idf(t) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / AVG_LEN)));
    }
    return { section: d.section, score, reason: "semantic" as const };
  })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

/** Pull explicit section references like "304A", "s. 420", "Section 498-A" from text. */
export function extractSectionNumbers(text: string): string[] {
  const out = new Set<string>();
  const re = /(?:\b(?:section|sec|s|u\/s|ipc)\.?\s*)?\b(\d{2,3})\s*-?\s*([A-Ea-e])?\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const num = m[1] + (m[2] ? m[2].toUpperCase() : "");
    if (getSection(num)) out.add(num);
  }
  return [...out];
}

/**
 * Combined retrieval: explicit section numbers always win, then BM25 fills the rest.
 */
export function retrieve(query: string, extraKeywords: string[] = [], k = 6): RetrievalHit[] {
  const explicit = extractSectionNumbers(query);
  const hits: RetrievalHit[] = [];
  const seen = new Set<string>();
  for (const n of explicit) {
    const s = getSection(n)!;
    hits.push({ section: s, score: 100, reason: "explicit" });
    seen.add(s.section);
  }
  const q = [query, ...extraKeywords].join(" ");
  const semantic = searchSections(q, k + explicit.length);
  // Drop weak matches. An absolute floor keeps relevant secondary sections even when one
  // section dominates; when the user named sections, also require half the best score so a
  // simple lookup isn't padded with unrelated law.
  const top = semantic[0]?.score ?? 0;
  const floor = explicit.length ? Math.max(MIN_SCORE, top * 0.5) : MIN_SCORE;
  for (const h of semantic) {
    if (hits.length >= k) break;
    if (h.score < floor) break;
    if (seen.has(h.section.section)) continue;
    seen.add(h.section.section);
    hits.push(h);
  }
  return hits;
}

export function formatForPrompt(sections: IpcSection[]): string {
  return sections
    .map(
      (s) => `### IPC Section ${s.section} – ${s.title}
Chapter: ${s.chapter}
Summary: ${s.summary}
Essential ingredients: ${s.ingredients.map((i, n) => `(${n + 1}) ${i}`).join("; ")}
Punishment: ${s.punishment}
Classification: ${s.cognizable} | ${s.bailable} | ${s.compoundable} | Triable by: ${s.triableBy}
${s.industrialNote ? `Industrial/workplace note: ${s.industrialNote}\n` : ""}${s.judicialNote ? `Judicial note: ${s.judicialNote}\n` : ""}BNS 2023 equivalent: ${s.bnsEquivalent ?? "not mapped"}`,
    )
    .join("\n\n");
}
