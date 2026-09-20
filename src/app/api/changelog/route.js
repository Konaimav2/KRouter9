import { readFile } from "node:fs/promises";
import path from "node:path";

// Local changelog route: serves this deployment's own CHANGELOG.md so the
// dashboard never depends on a hardcoded upstream raw URL (which 404s when
// the fork lives under a different org/repo name).
export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "CHANGELOG.md");
    const markdown = await readFile(filePath, "utf8");
    return new Response(markdown, {
      status: 200,
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  } catch {
    return Response.json({ error: "CHANGELOG.md not found" }, { status: 404 });
  }
}
