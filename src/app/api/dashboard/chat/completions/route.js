import { handleChat } from "@/sse/handlers/chat.js";
import { initTranslators } from "open-sse/translator/index.js";

// Dashboard playground endpoint (Basic Chat page). Same-origin, cookie/JWT
// gated by dashboardGuard, so it runs handleChat in `internal` mode: no
// end-user API key required, while provider credentials/rotation still apply.
let initialized = false;
async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
  }
}

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

export async function POST(request) {
  await ensureInitialized();
  return handleChat(request, null, { internal: true });
}
