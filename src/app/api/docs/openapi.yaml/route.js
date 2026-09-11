import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

// Serve the committed OpenAPI spec. Public read-only.
export async function GET() {
  try {
    const file = path.join(process.cwd(), "docs", "openapi.yaml");
    const yaml = fs.readFileSync(file, "utf8");
    return new NextResponse(yaml, {
      headers: {
        "Content-Type": "application/yaml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "OpenAPI spec not found" }, { status: 404 });
  }
}
