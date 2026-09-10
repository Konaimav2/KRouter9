import { NextResponse } from "next/server";
import { deleteApiKey, getApiKeyById, rotateApiKey, updateApiKey } from "@/lib/localDb";

// GET /api/keys/[id] - Get single key
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const key = await getApiKeyById(id);
    if (!key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
    return NextResponse.json({ key });
  } catch (error) {
    console.log("Error fetching key:", error);
    return NextResponse.json({ error: "Failed to fetch key" }, { status: 500 });
  }
}

// PUT /api/keys/[id] - Update key: name, isActive, rpmLimit, tpmLimit,
// modelPolicy (off|whitelist|blacklist), allowedModels, blockedModels.
// POST /api/keys/[id]/rotate does the same thing under a clearer path.
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, isActive, rpmLimit, tpmLimit, modelPolicy, allowedModels, blockedModels, rotate } = body;

    const existing = await getApiKeyById(id);
    if (!existing) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    // Rotate: issue a fresh key string for the same id (old string dies).
    if (rotate === true) {
      const rotated = await rotateApiKey(id);
      return NextResponse.json({ key: rotated, rotated: true });
    }

    const updateData = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "Name must be a non-empty string" }, { status: 400 });
      }
      updateData.name = name.trim();
    }
    if (isActive !== undefined) updateData.isActive = !!isActive;
    if (rpmLimit !== undefined) updateData.rpmLimit = rpmLimit;
    if (tpmLimit !== undefined) updateData.tpmLimit = tpmLimit;
    if (modelPolicy !== undefined) {
      if (!["off", "whitelist", "blacklist"].includes(modelPolicy)) {
        return NextResponse.json({ error: "modelPolicy must be off|whitelist|blacklist" }, { status: 400 });
      }
      updateData.modelPolicy = modelPolicy;
    }
    if (allowedModels !== undefined) updateData.allowedModels = allowedModels;
    if (blockedModels !== undefined) updateData.blockedModels = blockedModels;

    const updated = await updateApiKey(id, updateData);

    return NextResponse.json({ key: updated });
  } catch (error) {
    console.log("Error updating key:", error);
    return NextResponse.json({ error: "Failed to update key" }, { status: 500 });
  }
}

// DELETE /api/keys/[id] - Delete API key
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;

    const deleted = await deleteApiKey(id);
    if (!deleted) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Key deleted successfully" });
  } catch (error) {
    console.log("Error deleting key:", error);
    return NextResponse.json({ error: "Failed to delete key" }, { status: 500 });
  }
}
