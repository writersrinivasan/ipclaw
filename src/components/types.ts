export interface TraceStep {
  node: string;
  triage?: { intent: string; sections: string[]; keywords: string[]; reformulated: string };
  retrieved?: { section: string; title: string }[];
  verification?: { cited: string[]; grounded: string[]; ungrounded: string[]; hallucinated: string[]; passed: boolean };
  attempt?: number;
  final?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: TraceStep[];
  running?: boolean;
  error?: string;
}

export const GROQ_MODELS = [
  { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile (recommended)" },
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
  { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B" },
  { id: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B" },
  { id: "qwen/qwen3-32b", label: "Qwen3 32B" },
  { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant (fast)" },
];
