"use client";
import { useEffect, useState } from "react";
import type { IpcSection } from "@/lib/ipc/types";

type Lite = Pick<IpcSection, "section" | "title" | "chapter" | "cognizable" | "bailable">;

export default function SectionBrowser({ onAsk }: { onAsk: (q: string) => void }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Lite[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState<IpcSection | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/sections?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => {
          setList(d.sections ?? []);
          setTotal(d.total ?? 0);
        })
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  async function openSection(id: string) {
    const r = await fetch(`/api/sections?id=${encodeURIComponent(id)}`);
    if (r.ok) setOpen(await r.json());
  }

  return (
    <div className="flex h-full flex-col">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search sections (e.g. 304A, theft, negligence)"
        className="w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
      />
      <div className="mt-1 text-[11px] text-[var(--muted)]">{total} sections in knowledge base{q ? " · ranked by relevance" : ""}</div>
      <ul className="mt-2 flex-1 space-y-1 overflow-y-auto pr-1">
        {list.map((s) => (
          <li key={s.section}>
            <button
              type="button"
              onClick={() => openSection(s.section)}
              className="w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--accent-soft)]"
            >
              <div className="text-sm">
                <span className="font-semibold text-[var(--accent)]">§{s.section}</span> <span>{s.title}</span>
              </div>
              <div className="text-[11px] text-[var(--muted)]">
                {s.cognizable} · {s.bailable}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setOpen(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{open.chapter}</div>
            <h3 className="mt-1 text-lg font-semibold">
              <span className="text-[var(--accent)]">IPC §{open.section}</span> – {open.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed">{open.summary}</p>
            <h4 className="mt-4 text-sm font-semibold">Essential ingredients</h4>
            <ol className="ml-5 list-decimal text-sm">
              {open.ingredients.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ol>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Stat label="Punishment" value={open.punishment} wide />
              <Stat label="Cognizable" value={open.cognizable} />
              <Stat label="Bailable" value={open.bailable} />
              <Stat label="Compoundable" value={open.compoundable} />
              <Stat label="Triable by" value={open.triableBy} />
            </div>
            {open.industrialNote && (
              <p className="mt-3 rounded-md bg-[var(--accent-soft)] p-3 text-sm">
                <b>Industrial / workplace:</b> {open.industrialNote}
              </p>
            )}
            {open.judicialNote && (
              <p className="mt-2 text-sm text-[var(--muted)]">
                <b>Judicial note:</b> {open.judicialNote}
              </p>
            )}
            <p className="mt-2 text-sm">
              <b>BNS 2023 equivalent:</b> {open.bnsEquivalent ?? "not mapped"}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(null)} className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm">
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  onAsk(`Explain IPC Section ${open.section} with an example, and tell me if it is bailable and compoundable.`);
                  setOpen(null);
                }}
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white"
              >
                Ask the assistant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-md border border-[var(--line)] p-2 ${wide ? "col-span-2 sm:col-span-4" : ""}`}>
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
