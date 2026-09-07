import { DefaultExecutor } from "./default.js";

/**
 * CodeBuddyIntlExecutor — talks to https://www.codebuddy.ai/v2/chat/completions
 *
 * Same OpenAI-compatible-but-stream-only gateway behavior as codebuddy-cn:
 * non-stream requests are rejected, and reasoning is surfaced only when the
 * request carries the IDE's OpenAI-style reasoning params. Force stream and
 * mirror reasoning_summary exactly like CodeBuddyExecutor.
 */
export class CodeBuddyIntlExecutor extends DefaultExecutor {
  constructor() {
    super("codebuddy-intl");
  }

  transformRequest(model, body, stream, credentials) {
    const transformed = super.transformRequest(model, body, stream, credentials);
    transformed.stream = true;

    const eff = transformed.reasoning_effort;
    if (eff === "none" || eff === "off") {
      delete transformed.reasoning_effort;
    } else if (eff) {
      transformed.reasoning_summary = "auto";
    }

    // CodeBuddy rejects plain OpenAI shape (11101 invalid request): needs a
    // leading system prompt + user content as typed blocks, not a bare string.
    const source = Array.isArray(transformed.messages) ? transformed.messages : [];
    transformed.messages = [{ role: "system", content: "You are CodeBuddy Code." }];
    for (const message of source) {
      if (!message || typeof message !== "object" || ["system", "developer"].includes(message.role)) continue;
      if (message.role === "user" && typeof message.content === "string") {
        transformed.messages.push({ ...message, content: [{ type: "text", text: message.content }] });
      } else {
        transformed.messages.push({ ...message });
      }
    }

    // response_format: CodeBuddy is stream-only and ignores/breaks on it — drop
    // and mirror the schema/directive into the last user text. (srouter ac92a2b)
    const rf = transformed.response_format;
    if (rf && (rf.type === "json_schema" || rf.type === "json_object")) {
      delete transformed.response_format;
      let directive = rf.type === "json_object" ? "Respond only in valid JSON." : "";
      if (rf.type === "json_schema") {
        const schemaObj = rf.json_schema?.schema ?? rf.json_schema;
        if (schemaObj) {
          directive = "You must respond with valid JSON matching this schema:\\n" +
            JSON.stringify(schemaObj, null, 2);
        }
      }
      if (directive) {
        const msgs = transformed.messages || [];
        for (let i = msgs.length - 1; i >= 0; i--) {
          const m = msgs[i];
          if (m.role !== "user") continue;
          if (typeof m.content === "string") {
            m.content = m.content + "\\n\\n" + directive;
          } else if (Array.isArray(m.content)) {
            const lastText = [...m.content].reverse().find(b => b.type === "text");
            if (lastText) lastText.text = lastText.text + "\\n\\n" + directive;
            else m.content.push({ type: "text", text: directive });
          }
          break;
        }
      }
    }

    return transformed;
  }
}

export default CodeBuddyIntlExecutor;
