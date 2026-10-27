import Link from "next/link";
import type { Metadata } from "next";
import { IPC_SECTIONS } from "@/lib/ipc/sections";

export const metadata: Metadata = { title: "How it works – IPC Navigator" };

const STEPS = [
  ["Triage", "An LLM call classifies the question (scenario, section lookup, punishment, procedure, greeting, out of scope), pulls out any section numbers, and suggests legal search terms."],
  ["Retrieve", "Section numbers you typed are fetched directly. A BM25 keyword search fills in the rest from the curated knowledge base, and weak matches are dropped."],
  ["Analyze", "The model writes the answer using only the retrieved sections. It is streamed to your screen as it is written."],
  ["Verify", "Plain code, not a model, checks every cited § against the retrieved sections. A citation from outside them sends the graph back to Retrieve to pull that section in and redraft, at most twice."],
  ["Finalize", "Any citation that still can't be verified is flagged in a warning box, and the legal disclaimer is attached."],
];

export default function About() {
  const chapters = new Set(IPC_SECTIONS.map((s) => s.chapter.split(" – ")[0].split(" (")[0]));
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-[15px] leading-relaxed">
      <Link href="/" className="text-sm text-[var(--accent)] underline">← Back to the assistant</Link>
      <h1 className="mt-4 text-2xl font-semibold">How IPC Navigator works</h1>
      <p className="mt-2 text-[var(--muted)]">
        A public legal-information assistant for the Indian Penal Code, 1860, built with Next.js and a LangGraph agent running on Groq models.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-[var(--accent)]">The agent graph</h2>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-[var(--line)] bg-white p-4 text-[12.5px] leading-snug">{`START → Triage ─┬─ greeting / out of scope ─→ Respond ─→ END
                └─→ Retrieve → Analyze → Verify ─┬─ citation outside context ─→ Retrieve
                                                 └─→ Finalize ─→ END`}</pre>
      <ol className="mt-4 space-y-3">
        {STEPS.map(([name, text], i) => (
          <li key={name} className="flex gap-3">
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">{i + 1}</span>
            <div><b>{name}.</b> {text}</div>
          </li>
        ))}
      </ol>

      <h2 className="mt-8 text-lg font-semibold text-[var(--accent)]">The knowledge base</h2>
      <p className="mt-2">
        {IPC_SECTIONS.length} sections across {chapters.size} chapters, chosen for the offences the public, HR teams and factory managers meet most.
        Each entry has a plain-language summary, the essential ingredients, punishment, cognizable / bailable / compoundable status, the trial court,
        a workplace note, leading judgments and the equivalent Bharatiya Nyaya Sanhita (BNS) section.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-[var(--accent)]">Your API key</h2>
      <p className="mt-2">
        The app uses Bring Your Own Key. Your Groq key is kept in your browser&apos;s local storage and sent only with your own requests. The server
        uses it for that request and never stores or logs it. You can clear it at any time in Settings.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-[var(--accent)]">Limits</h2>
      <ul className="mt-2 ml-5 list-disc space-y-1">
        <li>This is legal information, not legal advice. Talk to a licensed advocate about your own case.</li>
        <li>The IPC was replaced by the BNS from 1 July 2024. The IPC still applies to offences committed before that date.</li>
        <li>State amendments can change whether an offence is cognizable or bailable in your state.</li>
        <li>The knowledge base covers the most-used sections, not all 511. Citations outside it are flagged.</li>
      </ul>
    </main>
  );
}
