import { NextResponse } from "next/server";
import { getProviderConnections, updateProviderConnection } from "@/models";

export const dynamic = "force-dynamic";

// POST /api/providers/toggle - bulk enable/disable connections for a provider.
// Body: { provider, authType?: string|string[], isActive: boolean }
// Replaces N parallel PUT /api/providers/:id calls from the providers list.
export async function POST(request) {
  try {
    const body = await request.json();
    const provider = body.provider;
    if (!provider) return NextResponse.json({ error: "provider is required" }, { status: 400 });
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 });
    }

    const authTypes = body.authType === undefined
      ? null
      : (Array.isArray(body.authType) ? body.authType : [body.authType]);

    const all = await getProviderConnections({ provider });
    const targets = authTypes ? all.filter((c) => authTypes.includes(c.authType)) : all;

    let updated = 0;
    for (const c of targets) {
      await updateProviderConnection(c.id, { isActive: body.isActive });
      updated++;
    }

    return NextResponse.json({ updated });
  } catch (error) {
    console.log("Error toggling provider connections:", error);
    return NextResponse.json({ error: "Failed to toggle provider connections" }, { status: 500 });
  }
}
