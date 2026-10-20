import { beforeEach, describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";

let signAwsRequest, escapeUri, parseEventFrame, encodeEventFrame, crc32, BEDROCK, AWS_SIGV4;
beforeEach(async () => {
  ({ signAwsRequest, escapeUri } = await import("../../open-sse/utils/awsSigv4.js"));
  ({ parseEventFrame, encodeEventFrame, crc32 } = await import("../../open-sse/utils/awsEventStream.js"));
  ({ BEDROCK, AWS_SIGV4 } = await import("../../open-sse/config/awsConstants.js"));
});

const credentials = {
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
};
const date = new Date("2015-08-30T12:36:00Z");
function request() {
  return {
    method: "POST",
    url: `https://bedrock-runtime.${BEDROCK.defaultRegion}.amazonaws.com/model/us.anthropic.claude-sonnet-4-20250514-v1%3A0/${BEDROCK.streamPath}`,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anthropic_version: BEDROCK.anthropicVersion, messages: [] }),
    region: BEDROCK.defaultRegion,
    service: BEDROCK.service,
    credentials,
    date,
  };
}

describe("AWS SigV4", () => {
  it("matches the independently aws4-verified Bedrock known-answer vector", () => {
    expect(signAwsRequest(request()).Authorization).toBe(
      `${AWS_SIGV4.algorithm} Credential=AKIDEXAMPLE/20150830/${BEDROCK.defaultRegion}/${BEDROCK.service}/${AWS_SIGV4.terminator}, ` +
      "SignedHeaders=content-type;host;x-amz-date, Signature=53d28679a943780f541a376e6ae08bb2b10379169a756a881a166d63132c94ab",
    );
  });

  it("constructs the canonical request with sorted normalized headers and double-escaped path", () => {
    const req = request();
    req.headers = { "X-Zebra": "  a   b\tc ", "Content-Type": "application/json" };
    const hash = (value) => createHash("sha256").update(value).digest("hex");
    const canonical = [
      "POST",
      `/model/us.anthropic.claude-sonnet-4-20250514-v1%253A0/${BEDROCK.streamPath}`,
      "",
      `content-type:application/json\nhost:bedrock-runtime.${BEDROCK.defaultRegion}.amazonaws.com\nx-amz-date:20150830T123600Z\nx-zebra:a b c\n`,
      "content-type;host;x-amz-date;x-zebra",
      hash(req.body),
    ].join("\n");
    const scope = `20150830/${req.region}/${req.service}/${AWS_SIGV4.terminator}`;
    const key = ["20150830", req.region, req.service, AWS_SIGV4.terminator].reduce(
      (secret, part) => createHmac("sha256", secret).update(part).digest(),
      `${AWS_SIGV4.keyPrefix}${credentials.secretAccessKey}`,
    );
    const signature = createHmac("sha256", key)
      .update([AWS_SIGV4.algorithm, "20150830T123600Z", scope, hash(canonical)].join("\n"))
      .digest("hex");
    expect(signAwsRequest(req).Authorization).toContain(`Signature=${signature}`);
  });

  it("sends and signs the temporary session token", () => {
    const req = request();
    const signed = signAwsRequest({ ...req, credentials: { ...credentials, sessionToken: "temporary-token" } });
    expect(signed[AWS_SIGV4.securityTokenHeader]).toBe("temporary-token");
    expect(signed.Authorization).toContain("SignedHeaders=content-type;host;x-amz-date;x-amz-security-token");
    expect(signed[AWS_SIGV4.dateHeader]).toBe("20150830T123600Z");
    expect(signed.Authorization).not.toBe(signAwsRequest(req).Authorization);
  });

  it("escapes RFC3986 reserved characters", () => {
    expect(escapeUri("a!b'c(d)e*f:0/ ")).toBe("a%21b%27c%28d%29e%2Af%3A0%2F%20");
  });

  it("supports explicitly single-encoded paths", () => {
    expect(signAwsRequest({ ...request(), doubleEncodePath: false }).Authorization)
      .not.toBe(signAwsRequest(request()).Authorization);
  });

  it("rejects queries rather than signing an incorrect canonical request", () => {
    const req = request();
    expect(() => signAwsRequest({ ...req, url: `${req.url}?b=2&a=a%20b` })).toThrow(/does not support query strings/);
  });

  it("rejects incomplete signing keys", () => {
    expect(() => signAwsRequest({ ...request(), credentials: { accessKeyId: "AKIA" } }))
      .toThrow(/accessKeyId and secretAccessKey/);
  });
});

describe("AWS EventStream", () => {
  it("decodes a complete chunk frame including a nonzero buffer offset", () => {
    const headers = { ":message-type": "event", ":event-type": "chunk" };
    const payload = { bytes: Buffer.from('{"type":"message_stop"}').toString("base64") };
    const frame = encodeEventFrame(headers, payload);
    const padded = new Uint8Array(frame.length + 4);
    padded.set(frame, 2);
    expect(parseEventFrame(padded.subarray(2, -2))).toEqual({ headers, payload });
  });

  it("preserves error frames for the caller to handle", () => {
    const headers = { ":message-type": "exception", ":exception-type": "throttlingException" };
    expect(parseEventFrame(encodeEventFrame(headers, { message: "Too many requests" })))
      .toEqual({ headers, payload: { message: "Too many requests" } });
    const errorHeaders = { ":message-type": "error", ":error-code": "InternalFailure", ":error-message": "Unavailable" };
    expect(parseEventFrame(encodeEventFrame(errorHeaders))).toEqual({ headers: errorHeaders, payload: null });
  });

  it("rejects truncated input at every byte boundary", () => {
    const frame = encodeEventFrame({ ":event-type": "chunk" }, { bytes: "e30=" });
    for (let length = 0; length < frame.length; length++) {
      expect(() => parseEventFrame(frame.subarray(0, length))).toThrow(/shorter|length/);
    }
  });

  it("checks both prelude and message CRCs", () => {
    const prelude = encodeEventFrame({}, { ok: true });
    prelude[8] ^= 1;
    expect(() => parseEventFrame(prelude)).toThrow(/prelude CRC/);
    const message = encodeEventFrame({}, { ok: true });
    message[12] ^= 1;
    expect(() => parseEventFrame(message)).toThrow(/message CRC/);
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("enforces configurable frame and header limits", () => {
    const frame = encodeEventFrame({ name: "value" });
    expect(() => parseEventFrame(frame, { maxMessageBytes: frame.length - 1 })).toThrow(/bounds/);
    expect(() => parseEventFrame(frame, { maxHeadersBytes: 1 })).toThrow(/bounds/);
  });

  it("rejects malformed header lengths even with valid CRCs", () => {
    const frame = encodeEventFrame({ name: "value" });
    frame[12] = 255;
    new DataView(frame.buffer).setUint32(frame.length - 4, crc32(frame.subarray(0, -4)), false);
    expect(() => parseEventFrame(frame)).toThrow(/header exceeds/);
  });

  it("rejects invalid JSON payloads instead of returning a partial response", () => {
    const frame = encodeEventFrame({}, {});
    frame[12] = 0x21;
    new DataView(frame.buffer).setUint32(frame.length - 4, crc32(frame.subarray(0, -4)), false);
    expect(() => parseEventFrame(frame)).toThrow(/not valid JSON/);
  });
});
