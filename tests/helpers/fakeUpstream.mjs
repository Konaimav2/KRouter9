// Fake OpenAI-compatible upstream for P7 live tests.
// Modes driven by the requested model string:
//   ok          → normal SSE chat stream
//   err200      → HTTP 200 with an error-shaped body (non-stream 200-trap)
//   emptystream → HTTP 200 SSE that emits an error event / dies (combo probe)
//   delay:<ms>  → delay headers ms before responding
//   echo        → JSON body echoing received headers (UA/header verification)
import http from "node:http";

const PORT = Number(process.env.FAKE_UPSTREAM_PORT || 19099);

function send(res, code, obj, extra = {}) {
  res.writeHead(code, { "Content-Type": "application/json", ...extra });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    let body = {};
    try { body = JSON.parse(raw || "{}"); } catch {}
    const model = String(body.model || "");
    const headers = req.headers;

    const delayMatch = model.match(/delay:(\d+)/);
    const start = () => {
      if (delayMatch) return setTimeout(handle, Number(delayMatch[1]));
      return handle();
    };

    function handle() {
      if (model.includes("echo")) {
        return send(res, 200, {
          id: "echo",
          object: "chat.completion",
          choices: [{ message: { role: "assistant", content: "echo" }, finish_reason: "stop" }],
          received: {
            userAgent: headers["user-agent"] || null,
            custom: headers["x-kr9-test"] || null,
            authorization: headers["authorization"] ? "present" : null,
          },
        });
      }
      if (model.includes("err200")) {
        // 200 with an error body (no choices) — exercises the non-stream 200 trap.
        return send(res, 200, { error: { message: "upstream overloaded", type: "server_error" } });
      }
      if (model.includes("emptystream")) {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write('data: {"error":{"message":"capacity exhausted"}}\n\n');
        return res.end();
      }
      // Default: SSE chat stream.
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
      chunk({ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: "Hello" } }] });
      chunk({ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: " world" } }] });
      chunk({ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 2 } });
      res.write("data: [DONE]\n\n");
      res.end();
    }
    start();
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`fake upstream on ${PORT}`));
