"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AgentTrace from "./AgentTrace";
import Markdown from "./Markdown";
import SectionBrowser from "./SectionBrowser";
import SettingsDialog from "./SettingsDialog";
import { useSettings, writeSettings, type Settings } from "./settingsStore";
import { GROQ_MODELS, type ChatMessage, type TraceStep } from "./types";

const EXAMPLES: { tag: string; q: string }[] = [
  { tag: "Factory accident", q: "A contract worker at our stamping plant lost his hand because the press's safety guard was removed to speed up production. The supervisor knew. Which IPC sections apply to the supervisor, the factory manager and the occupier?" },
  { tag: "Fatal incident", q: "A boiler exploded in a dyeing unit in Tiruppur and two workers died. Management had ignored two inspection notices. What is the difference between charging under 304A and 304 Part II here?" },
  { tag: "Employee fraud", q: "Our accounts executive created fake vendor invoices and transferred ₹18 lakh to his relative's account over 8 months. What offences are made out and are they bailable?" },
  { tag: "PF not deposited", q: "My employer deducts provident fund from my salary but has not deposited it for 14 months. Is this a criminal offence under IPC?" },
  { tag: "POSH / harassment", q: "A manager keeps sending late-night messages to a woman colleague asking her out even after she said no, and made comments about her clothes in a meeting. What IPC provisions apply apart from the POSH Act?" },
  { tag: "Strike turned violent", q: "During a wage protest, a group of about 40 workers blocked the factory gate, did not let managers leave for 6 hours and damaged three company vehicles. What sections could the police register?" },
  { tag: "Chemical leak", q: "Ammonia leaked from a cold storage plant at night and 30 residents nearby were hospitalised; none died. Which IPC sections are relevant for the owner?" },
  { tag: "Section lookup", q: "Is IPC Section 420 bailable, and what must the complainant prove?" },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function ChatApp() {
  const stored = useSettings();
  const settings: Settings = useMemo(() => stored ?? { apiKey: "", model: GROQ_MODELS[0].id }, [stored]);
  const [settingsToggle, setSettingsOpen] = useState<boolean | null>(null);
  // Before the user touches the dialog, open it automatically when no key is stored.
  const settingsOpen = settingsToggle ?? (stored !== null && !stored.apiKey);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"examples" | "browser">("examples");
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const saveSettings = (s: Settings) => {
    writeSettings(s);
    setSettingsOpen(false);
  };

  const copyAnswer = async (m: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(m.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  const newChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
  };

  const patchLast = useCallback((fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => {
      const next = prev.slice();
      next[next.length - 1] = fn(next[next.length - 1]);
      return next;
    });
  }, []);

  const send = useCallback(
    async (text: string, opts: { retry?: boolean } = {}) => {
      const q = text.trim();
      if (!q || busy) return;
      if (!settings.apiKey) {
        setSettingsOpen(true);
        return;
      }
      const userMsg: ChatMessage = { id: uid(), role: "user", content: q };
      const asstMsg: ChatMessage = { id: uid(), role: "assistant", content: "", trace: [], running: true };
      // On retry, drop the failed question/answer pair so it is not sent twice.
      const base = opts.retry ? messages.slice(0, -2) : messages;
      const history = [...base, userMsg].map(({ role, content }) => ({ role, content }));
      setMessages([...base, userMsg, asstMsg]);
      setInput("");
      setBusy(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-groq-api-key": settings.apiKey },
          body: JSON.stringify({ messages: history, model: settings.model }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let draft = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const raw = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const evLine = raw.split("\n").find((l) => l.startsWith("event:"));
            const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
            if (!evLine || !dataLine) continue;
            const event = evLine.slice(6).trim();
            const data = JSON.parse(dataLine.slice(5));
            if (event === "token") {
              draft += data.text;
              const snapshot = draft;
              patchLast((m) => ({ ...m, content: snapshot }));
            } else if (event === "step") {
              const step = data as TraceStep;
              if (step.node === "retrieve") draft = ""; // a (re)retrieval precedes a fresh draft
              patchLast((m) => ({
                ...m,
                trace: [...(m.trace ?? []), step],
                content: step.final ?? m.content,
              }));
            } else if (event === "error") {
              patchLast((m) => ({ ...m, error: data.message, running: false }));
            } else if (event === "done") {
              patchLast((m) => ({ ...m, running: false }));
            }
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        patchLast((m) => ({ ...m, error: ctrl.signal.aborted ? "Stopped." : msg, running: false }));
      } finally {
        setBusy(false);
        abortRef.current = null;
        patchLast((m) => ({ ...m, running: false }));
      }
    },
    [busy, messages, patchLast, settings],
  );

  const ask = (q: string) => {
    setDrawerOpen(false);
    send(q);
  };

  const sidePanel = (
    <>
      <div className="mb-2 flex gap-1 rounded-md bg-[#f1efe9] p-1 text-sm">
            {(["examples", "browser"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 rounded px-2 py-1 ${tab === t ? "bg-white font-medium shadow-sm" : "text-[var(--muted)]"}`}
              >
                {t === "examples" ? "Industrial scenarios" : "Section browser"}
              </button>
            ))}
          </div>
          {tab === "examples" ? (
            <ul className="space-y-1.5 overflow-y-auto">
              {EXAMPLES.map((e) => (
                <li key={e.tag}>
                  <button
                    type="button"
                    onClick={() => ask(e.q)}
                    disabled={busy}
                    className="w-full rounded-md border border-[var(--line)] p-2 text-left hover:bg-[var(--accent-soft)] disabled:opacity-50"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">{e.tag}</div>
                    <div className="line-clamp-3 text-[12.5px] leading-snug text-[var(--ink)]">{e.q}</div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <SectionBrowser onAsk={ask} />
          )}
    </>
  );

  const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.content;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">
            <span className="text-[var(--accent)]">IPC Navigator</span> <span className="text-[var(--muted)]">· Indian Penal Code AI assistant</span>
          </h1>
          <div className="truncate text-[11px] text-[var(--muted)]">LangGraph agent · Groq BYOK · grounded citations with deterministic verification</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm md:hidden"
          >
            Browse
          </button>
          <Link href="/about" className="hidden text-sm text-[var(--muted)] underline sm:inline">
            How it works
          </Link>
          {messages.length > 0 && (
            <button type="button" onClick={newChat} className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm">
              New chat
            </button>
          )}
          <span className="hidden rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--muted)] sm:inline">
            {GROQ_MODELS.find((m) => m.id === settings.model)?.label.split(" (")[0] ?? settings.model}
          </span>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${settings.apiKey ? "border border-[var(--line)]" : "bg-[var(--accent)] text-white"}`}
          >
            {settings.apiKey ? "Settings" : "Add Groq key"}
          </button>
        </div>
      </header>

      <div className="border-b border-[var(--line)] bg-[#fff8e6] px-4 py-1.5 text-[12px] text-[#5a4300]">
        <b>Note:</b> The IPC, 1860 was replaced by the Bharatiya Nyaya Sanhita, 2023 from 1 July 2024; IPC still governs earlier offences. This tool gives legal information, not legal advice.
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-80 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--panel)] p-3 md:flex">{sidePanel}</aside>
        {drawerOpen && (
          <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setDrawerOpen(false)}>
            <div className="flex h-full w-[85%] max-w-sm flex-col bg-[var(--panel)] p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">Browse</span>
                <button type="button" onClick={() => setDrawerOpen(false)} className="text-sm text-[var(--muted)]">Close</button>
              </div>
              {sidePanel}
            </div>
          </div>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.length === 0 && (
                <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
                  <h2 className="text-lg font-semibold">Ask about any offence under the Indian Penal Code</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Describe a situation (workplace accident, fraud, harassment, theft, threats) or ask about a section number. The agent will triage
                    your question, retrieve the matching sections from a verified knowledge base, draft an analysis, and verify every citation before
                    answering.
                  </p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {EXAMPLES.slice(0, 4).map((e) => (
                      <button
                        key={e.tag}
                        type="button"
                        onClick={() => send(e.q)}
                        className="rounded-md border border-[var(--line)] p-3 text-left text-sm hover:bg-[var(--accent-soft)]"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">{e.tag}</div>
                        <div className="line-clamp-2 text-[13px]">{e.q}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                  {m.role === "user" ? (
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--accent)] px-4 py-2.5 text-sm text-white">{m.content}</div>
                  ) : (
                    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
                      {m.content ? (
                        <Markdown>{m.content}</Markdown>
                      ) : m.running ? (
                        <div className="text-sm text-[var(--muted)]">Thinking…</div>
                      ) : null}
                      {m.error && <div className="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-800">{m.error}</div>}
                      {!m.running && (m.content || m.error) && (
                        <div className="mt-2 flex gap-3 text-xs text-[var(--muted)]">
                          {m.content && (
                            <button type="button" onClick={() => copyAnswer(m)} className="underline">
                              {copied === m.id ? "Copied" : "Copy answer"}
                            </button>
                          )}
                          {m.error && m.id === messages[messages.length - 1]?.id && lastUserText && (
                            <button
                              type="button"
                              onClick={() => send(lastUserText, { retry: true })}
                              className="underline"
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      )}
                      <AgentTrace steps={m.trace ?? []} running={!!m.running} />
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t border-[var(--line)] bg-[var(--panel)] p-3"
          >
            <div className="mx-auto flex max-w-3xl items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={2}
                placeholder="Describe the situation or ask about a section… (Enter to send, Shift+Enter for newline)"
                className="flex-1 resize-none rounded-md border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
              {busy ? (
                <button type="button" onClick={() => abortRef.current?.abort()} className="rounded-md border border-[var(--line)] px-4 py-2 text-sm">
                  Stop
                </button>
              ) : (
                <button type="submit" disabled={!input.trim()} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
                  Ask
                </button>
              )}
            </div>
          </form>
        </main>
      </div>

      <SettingsDialog key={settingsOpen ? "open" : "closed"} open={settingsOpen} initial={settings} onClose={() => setSettingsOpen(false)} onSave={saveSettings} />
    </div>
  );
}
