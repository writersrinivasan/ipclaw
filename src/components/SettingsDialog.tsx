"use client";
import { useState } from "react";
import { GROQ_MODELS } from "./types";
import type { Settings } from "./settingsStore";

export default function SettingsDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: Settings;
  onClose: () => void;
  onSave: (s: Settings) => void;
}) {
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [model, setModel] = useState(initial.model);
  const [show, setShow] = useState(false);
  if (!open) return null;
  const valid = apiKey.trim().startsWith("gsk_") && apiKey.trim().length > 20;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Bring Your Own Key (Groq)</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Your key stays in this browser (localStorage) and is sent only with your own requests as a header. The server never stores it.
          Get a free key at{" "}
          <a className="text-[var(--accent)] underline" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
            console.groq.com/keys
          </a>
          .
        </p>
        <label className="mt-4 block text-sm font-medium">Groq API key</label>
        <div className="mt-1 flex gap-2">
          <input
            type={show ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="gsk_…"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 rounded-md border border-[var(--line)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent)]"
          />
          <button type="button" onClick={() => setShow((v) => !v)} className="rounded-md border border-[var(--line)] px-3 text-xs">
            {show ? "Hide" : "Show"}
          </button>
        </div>
        {apiKey && !valid && <p className="mt-1 text-xs text-red-700">Groq keys start with “gsk_”.</p>}
        <label className="mt-4 block text-sm font-medium">Model</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm"
        >
          {GROQ_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <div className="mt-5 flex justify-between">
          <button
            type="button"
            onClick={() => {
              setApiKey("");
              onSave({ apiKey: "", model });
            }}
            className="text-xs text-[var(--muted)] underline"
          >
            Clear key
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-[var(--line)] px-4 py-2 text-sm">
              Cancel
            </button>
            <button
              type="button"
              disabled={!valid}
              onClick={() => onSave({ apiKey: apiKey.trim(), model })}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
