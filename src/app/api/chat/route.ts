import { NextRequest } from "next/server";
import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { ipcGraph } from "@/lib/agent/graph";


interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-groq-api-key")?.trim();
  if (!apiKey || !apiKey.startsWith("gsk_")) {
    return Response.json(
      { error: "A Groq API key is required (BYOK). Add it in Settings; it is sent only with your own requests and never stored on the server." },
      { status: 401 },
    );
  }
  let body: { messages?: ChatTurn[]; model?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const turns = (body.messages ?? []).filter((t) => t && typeof t.content === "string").slice(-12);
  const last = turns[turns.length - 1];
  if (!last || last.role !== "user" || !last.content.trim()) {
    return Response.json({ error: "Last message must be from the user" }, { status: 400 });
  }
  if (last.content.length > 4000) {
    return Response.json({ error: "Question too long (max 4000 characters)" }, { status: 413 });
  }

  const messages: BaseMessage[] = turns.map((t) =>
    t.role === "user" ? new HumanMessage(t.content) : new AIMessage(t.content),
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        const iterator = await ipcGraph.stream(
          { messages, question: last.content },
          {
            configurable: { groqApiKey: apiKey, model: body.model || "llama-3.3-70b-versatile" },
            streamMode: ["updates", "messages"],
            recursionLimit: 25,
          },
        );
        for await (const [mode, chunk] of iterator as AsyncIterable<[string, unknown]>) {
          if (mode === "messages") {
            const [msg, meta] = chunk as [{ content?: unknown }, { langgraph_node?: string; tags?: string[] }];
            if (!meta?.tags?.includes("analyst")) continue; // only stream the user-facing drafts
            const text = typeof msg.content === "string" ? msg.content : "";
            if (text) send("token", { node: meta.langgraph_node, text });
          } else if (mode === "updates") {
            const update = chunk as Record<string, Record<string, unknown>>;
            for (const [node, data] of Object.entries(update)) {
              const payload: Record<string, unknown> = {};
              if (node === "triage") payload.triage = data.triageResult;
              if (node === "retrieve")
                payload.retrieved = (data.retrieved as { section: string; title: string }[]).map((s) => ({
                  section: s.section,
                  title: s.title,
                }));
              if (node === "verify") payload.verification = data.verification;
              if (node === "analyze") payload.attempt = data.attempts;
              if (node === "finalize" || node === "simple_responder") payload.final = data.final;
              send("step", { node, ...payload });
            }
          }
        }
        send("done", {});
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send("error", { message: friendlyError(message) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function friendlyError(msg: string): string {
  if (/401|invalid api key|authentication/i.test(msg)) return "Groq rejected the API key. Check it in Settings (keys start with gsk_).";
  if (/429|rate limit/i.test(msg)) return "Groq rate limit hit. Wait a few seconds and retry, or switch to a smaller model.";
  if (/model.*(not found|decommissioned|does not exist)/i.test(msg)) return "That Groq model is unavailable. Pick another model in Settings.";
  return msg;
}
