"use client";
import type { TraceStep } from "./types";

const LABELS: Record<string, string> = {
  triage: "Triage",
  retrieve: "Retrieve",
  analyze: "Analyze",
  verify: "Verify",
  finalize: "Finalize",
  simple_responder: "Respond",
};

export default function AgentTrace({ steps, running }: { steps: TraceStep[]; running: boolean }) {
  if (steps.length === 0 && !running) return null;
  return (
    <div className="mt-2 rounded-lg border border-[var(--line)] bg-[#faf8f3] p-3 text-xs">
      <div className="mb-2 flex items-center gap-2 font-semibold uppercase tracking-wide text-[var(--muted)]">
        <span>LangGraph trace</span>
        {running && <span className="dot-pulse h-2 w-2 rounded-full bg-[var(--accent)]" />}
      </div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-white">
              {i + 1}
            </span>
            <div className="flex-1">
              <span className="font-semibold">{LABELS[s.node] ?? s.node}</span>
              {s.node === "triage" && s.triage && (
                <span className="text-[var(--muted)]">
                  {" "}· intent <b>{s.triage.intent}</b>
                  {s.triage.sections.length > 0 && <> · explicit §{s.triage.sections.join(", §")}</>}
                  {s.triage.keywords.length > 0 && <> · keywords: {s.triage.keywords.slice(0, 6).join(", ")}</>}
                </span>
              )}
              {s.node === "retrieve" && s.retrieved && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.retrieved.map((r) => (
                    <span key={r.section} title={r.title} className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[11px] text-[var(--accent)]">
                      §{r.section}
                    </span>
                  ))}
                </div>
              )}
              {s.node === "analyze" && <span className="text-[var(--muted)]"> · draft #{s.attempt ?? 1} (streamed)</span>}
              {s.node === "verify" && s.verification && (
                <span className={s.verification.passed ? "text-[var(--ok)]" : "text-[var(--warn)]"}>
                  {" "}· {s.verification.passed ? "all citations grounded" : "citation issues found"} ({s.verification.grounded.length} grounded
                  {s.verification.ungrounded.length > 0 && <>, {s.verification.ungrounded.length} outside context → re-retrieving</>}
                  {s.verification.hallucinated.length > 0 && <>, {s.verification.hallucinated.length} unknown</>})
                </span>
              )}
            </div>
          </li>
        ))}
        {running && steps.length === 0 && <li className="text-[var(--muted)]">Starting graph…</li>}
      </ol>
    </div>
  );
}
