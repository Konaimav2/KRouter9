import { NextResponse } from "next/server";
import { getApiKeyById, rotateApiKey } from "@/lib/localDb";

export const dynamic = "force-dynamic";

// POST /api/keys/[id]/rotate — issue a fresh key string for the same id.
// Old string stops working immediately. Returns the full key row.
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const existing = await getApiKeyById(id);
    if (!existing) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
    const rotated = await rotateApiKey(id);
    return NextResponse.json({ key: rotated, rotated: true });
  } catch (error) {
    console.log("Error rotating key:", error);
    return NextResponse.json({ error: "Failed to rotate key" }, { status: 500 });
  }
}
