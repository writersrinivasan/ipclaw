import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatGroq } from "@langchain/groq";
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { retrieve, extractSectionNumbers, formatForPrompt } from "@/lib/ipc/retriever";
import { getSection } from "@/lib/ipc/sections";
import type { IpcSection } from "@/lib/ipc/types";
import { ANALYST_SYSTEM, SIMPLE_RESPONDER_SYSTEM, TRIAGE_SYSTEM } from "./prompts";

/* ────────────────────────── State ────────────────────────── */

export type Intent =
  | "section_lookup"
  | "scenario_analysis"
  | "punishment_query"
  | "procedure_query"
  | "greeting"
  | "out_of_scope";

export interface Triage {
  intent: Intent;
  sections: string[];
  keywords: string[];
  reformulated: string;
}

export interface Verification {
  cited: string[];
  grounded: string[];
  ungrounded: string[]; // cited but NOT in retrieved context (exists in corpus)
  hallucinated: string[]; // cited but not in corpus at all
  passed: boolean;
}

export const AgentState = Annotation.Root({
  /** Full chat history; last message is the user's current question. */
  messages: Annotation<BaseMessage[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  question: Annotation<string>(),
  triageResult: Annotation<Triage | null>({ reducer: (_, b) => b, default: () => null }),
  retrieved: Annotation<IpcSection[]>({ reducer: (_, b) => b, default: () => [] }),
  /** Extra section numbers the verifier asked to be pulled in on retry. */
  expandWith: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
  draft: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  verification: Annotation<Verification | null>({ reducer: (_, b) => b, default: () => null }),
  attempts: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  final: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
});
export type AgentStateT = typeof AgentState.State;

/* ────────────────────────── Model factory (BYOK) ────────────────────────── */

export interface AgentConfigurable {
  groqApiKey: string;
  model: string;
}

function llm(config: RunnableConfig, opts: { temperature?: number; json?: boolean } = {}) {
  const c = (config.configurable ?? {}) as Partial<AgentConfigurable>;
  if (!c.groqApiKey) throw new Error("Missing Groq API key (BYOK). Add your key in the app settings.");
  return new ChatGroq({
    apiKey: c.groqApiKey,
    model: c.model || "llama-3.3-70b-versatile",
    temperature: opts.temperature ?? 0.2,
    maxTokens: 1800,
    ...(opts.json ? { modelKwargs: { response_format: { type: "json_object" } } } : {}),
  });
}

function heuristicTriage(question: string): Triage {
  const q = question.toLowerCase().trim();
  const sections = extractSectionNumbers(question);
  if (/^(hi|hello|hey|thanks|thank you|good (morning|evening|afternoon))\b/.test(q) && q.length < 40) {
    return { intent: "greeting", sections: [], keywords: [], reformulated: question };
  }
  const intent: Intent = sections.length && q.split(" ").length < 12
    ? /bail|punish|sentence|jail|fine/.test(q) ? "punishment_query" : "section_lookup"
    : "scenario_analysis";
  return { intent, sections, keywords: [], reformulated: question };
}

/* ────────────────────────── Nodes ────────────────────────── */

async function triageNode(state: AgentStateT, config: RunnableConfig) {
  const question = state.question;
  const fallback = heuristicTriage(question);
  try {
    const model = llm(config, { temperature: 0, json: true });
    const history = state.messages.slice(-6, -1);
    const res = await model.invoke([
      new SystemMessage(TRIAGE_SYSTEM),
      ...history,
      new HumanMessage(question),
    ]);
    const text = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Partial<Triage>;
    const triage: Triage = {
      intent: (parsed.intent as Intent) || fallback.intent,
      sections: Array.from(new Set([...(parsed.sections ?? []).map(String), ...fallback.sections])),
      keywords: (parsed.keywords ?? []).map(String).slice(0, 10),
      reformulated: parsed.reformulated || question,
    };
    return { triageResult: triage };
  } catch {
    return { triageResult: fallback };
  }
}

async function retrieveNode(state: AgentStateT) {
  const t = state.triageResult!;
  const query = [state.question, t.reformulated, ...t.sections.map((s) => `section ${s}`)].join(" ");
  const hits = retrieve(query, t.keywords, 6);
  const sections: IpcSection[] = hits.map((h) => h.section);
  const seen = new Set(sections.map((s) => s.section));
  // Verifier-requested expansion on retry: pull the exact sections the model cited.
  for (const n of state.expandWith) {
    const s = getSection(n);
    if (s && !seen.has(s.section)) {
      sections.push(s);
      seen.add(s.section);
    }
  }
  return { retrieved: sections, expandWith: [] };
}

async function analyzeNode(state: AgentStateT, config: RunnableConfig) {
  const model = llm(config, { temperature: 0.2 });
  const context = formatForPrompt(state.retrieved);
  const history = state.messages.slice(-6, -1);
  const retryNote = state.attempts > 0
    ? `\n\nPREVIOUS DRAFT WAS REJECTED: it cited sections absent from the context. The context has now been expanded. Cite ONLY the sections below.`
    : "";
  const res = await model.invoke(
    [
      new SystemMessage(ANALYST_SYSTEM + retryNote),
      ...history,
      new HumanMessage(
        `RETRIEVED SECTIONS (verified knowledge base):\n\n${context}\n\n---\nUSER QUESTION: ${state.question}\n(Triage intent: ${state.triageResult?.intent}; restated: ${state.triageResult?.reformulated})`,
      ),
    ],
    { ...config, tags: ["analyst"] },
  );
  const draft = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
  return { draft, attempts: state.attempts + 1 };
}

/** Deterministic citation check – no LLM, so it cannot itself hallucinate. */
async function verifyNode(state: AgentStateT) {
  const cited = new Set<string>();
  const re = /§\s*(\d{2,3}\s*-?\s*[A-Ea-e]?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(state.draft))) cited.add(m[1].replace(/[\s-]/g, "").toUpperCase());
  const inContext = new Set(state.retrieved.map((s) => s.section.toUpperCase()));
  const grounded: string[] = [];
  const ungrounded: string[] = [];
  const hallucinated: string[] = [];
  for (const c of cited) {
    if (inContext.has(c)) grounded.push(c);
    else if (getSection(c)) ungrounded.push(c);
    else hallucinated.push(c);
  }
  const passed = ungrounded.length === 0 && hallucinated.length === 0;
  return {
    verification: { cited: [...cited], grounded, ungrounded, hallucinated, passed },
    expandWith: ungrounded,
  };
}

async function finalizeNode(state: AgentStateT) {
  const v = state.verification!;
  let out = state.draft.trim();
  if (!v.passed) {
    const notes: string[] = [];
    if (v.ungrounded.length)
      notes.push(`Sections ${v.ungrounded.map((s) => `§${s}`).join(", ")} were cited from general knowledge rather than the retrieved context; verify them in the Section Browser.`);
    if (v.hallucinated.length)
      notes.push(`Sections ${v.hallucinated.map((s) => `§${s}`).join(", ")} are not in this assistant's knowledge base and could not be verified – treat them with caution.`);
    out += `\n\n> ⚠️ **Verifier note:** ${notes.join(" ")}`;
  }
  out += `\n\n---\n*This is general legal information on the Indian Penal Code, 1860, not legal advice. The IPC has been replaced by the Bharatiya Nyaya Sanhita, 2023 for offences committed on or after 1 July 2024. Classification follows the CrPC First Schedule and may be altered by State amendments. Consult a licensed advocate for your specific matter.*`;
  return { final: out, messages: [new AIMessage(out)] };
}

async function simpleResponderNode(state: AgentStateT, config: RunnableConfig) {
  const model = llm(config, { temperature: 0.5 });
  const res = await model.invoke(
    [new SystemMessage(SIMPLE_RESPONDER_SYSTEM), new HumanMessage(state.question)],
    { ...config, tags: ["analyst"] },
  );
  const text = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
  return { final: text, draft: text, messages: [new AIMessage(text)] };
}

/* ────────────────────────── Routing ────────────────────────── */

function routeAfterTriage(state: AgentStateT): "retrieve" | "simple_responder" {
  const i = state.triageResult?.intent;
  return i === "greeting" || i === "out_of_scope" ? "simple_responder" : "retrieve";
}

const MAX_ATTEMPTS = 2;
function routeAfterVerify(state: AgentStateT): "retrieve" | "finalize" {
  const v = state.verification!;
  if (!v.passed && v.ungrounded.length > 0 && state.attempts < MAX_ATTEMPTS) return "retrieve";
  return "finalize";
}

/* ────────────────────────── Graph ────────────────────────── */

export const ipcGraph = new StateGraph(AgentState)
  .addNode("triage", triageNode)
  .addNode("retrieve", retrieveNode)
  .addNode("analyze", analyzeNode)
  .addNode("verify", verifyNode)
  .addNode("finalize", finalizeNode)
  .addNode("simple_responder", simpleResponderNode)
  .addEdge(START, "triage")
  .addConditionalEdges("triage", routeAfterTriage, ["retrieve", "simple_responder"])
  .addEdge("retrieve", "analyze")
  .addEdge("analyze", "verify")
  .addConditionalEdges("verify", routeAfterVerify, ["retrieve", "finalize"])
  .addEdge("finalize", END)
  .addEdge("simple_responder", END)
  .compile();

export const NODE_LABELS: Record<string, string> = {
  triage: "Triage – classify intent & extract hints",
  retrieve: "Retrieve – BM25 search over IPC knowledge base",
  analyze: "Analyze – draft grounded legal analysis",
  verify: "Verify – deterministic citation check",
  finalize: "Finalize – attach disclaimer & verifier notes",
  simple_responder: "Respond – greeting / out-of-scope",
};
