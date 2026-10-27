import { NextRequest } from "next/server";
import { IPC_SECTIONS, getSection } from "@/lib/ipc/sections";
import { searchSections } from "@/lib/ipc/retriever";


export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (id) {
    const s = getSection(id);
    return s ? Response.json(s) : Response.json({ error: "Not found" }, { status: 404 });
  }
  if (!q) {
    return Response.json({
      total: IPC_SECTIONS.length,
      sections: IPC_SECTIONS.map(({ section, title, chapter, cognizable, bailable }) => ({ section, title, chapter, cognizable, bailable })),
    });
  }
  const exact = getSection(q);
  const hits = searchSections(q, 12).map((h) => h.section);
  const list = exact ? [exact, ...hits.filter((s) => s.section !== exact.section)] : hits;
  return Response.json({ total: list.length, sections: list });
}
