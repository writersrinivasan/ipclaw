# IPC Navigator: AI legal assistant on the Indian Penal Code

Next.js 16 + LangGraph.js + Groq (Bring Your Own Key).

## Run
```bash
npm install
npm run dev   # open http://localhost:3000, click "Add Groq key", paste gsk_... key
```
Get a free key at https://console.groq.com/keys. The key lives only in the browser's localStorage and is sent per request in the `x-groq-api-key` header. The server never stores it.

## Agent graph (src/lib/agent/graph.ts)
```
START → triage ──(greeting / out_of_scope)──→ simple_responder → END
           └──→ retrieve → analyze → verify ──(citations outside context, max 2 tries)──→ retrieve
                                         └──→ finalize → END
```
- **triage**: LLM JSON classification of intent, explicit sections, retrieval keywords.
- **retrieve**: BM25 search over 83 curated IPC sections plus explicit section lookup.
- **analyze**: grounded analysis, streamed token by token to the UI.
- **verify**: deterministic (non-LLM) check that every cited § exists in the retrieved context; loops back to expand retrieval.
- **finalize**: adds verifier warnings and legal disclaimer.

## Knowledge base (src/lib/ipc/sections.ts)
Each section carries summary, ingredients, punishment, cognizable/bailable/compoundable status, triable-by court, industrial note, judicial note and BNS 2023 equivalent.

## App features
- Chat with streamed answers and a live trace of each agent step.
- Eight industrial scenarios and a searchable section browser (drawer on mobile).
- New chat, copy answer, retry after an error, stop while generating.
- How-it-works page at /about.

## Deploy publicly
Push to GitHub and import on Vercel. No server env vars are needed because users bring their own key.

Legal information only, not legal advice. IPC replaced by BNS from 1 July 2024.
