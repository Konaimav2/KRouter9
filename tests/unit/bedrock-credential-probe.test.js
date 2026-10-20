import { readFileSync } from "node:fs";
import React from "react";
import PropTypes from "prop-types";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as providers from "../../src/shared/constants/providers.js";

vi.mock("../../open-sse/utils/proxyFetch.js", async (original) => ({
  ...(await original()), proxyAwareFetch: vi.fn(),
}));
vi.mock("@/models", () => ({ getProviderNodeById: vi.fn() }));
vi.mock("@/lib/localDb", () => ({}));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { probeBedrockCredentials } from "../../open-sse/executors/bedrock.js";
import { POST as validate } from "@/app/api/providers/validate/route.js";
import { testApiKeyConnection } from "@/app/api/providers/[id]/test/testUtils.js";

const credentials = { apiKey: "secret-access-key", providerSpecificData: { accessKeyId: "AKIAEXAMPLE", region: "us-east-1" } };
const awsResponse = (status, errorType) => new Response(JSON.stringify({ message: errorType }), {
  status, headers: errorType ? { "x-amzn-errortype": `${errorType}:http://internal.amazon.com/coral/` } : {},
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.clearAllMocks(); });

describe("Bedrock credential probes", () => {
  it.each([[200, undefined, true], [403, "AccessDeniedException", true], [403, "UnrecognizedClientException", false]])(
    "signs the control-plane request and interprets %s/%s", async (status, errorType, valid) => {
      const fetcher = vi.fn(async () => awsResponse(status, errorType));
      const result = await probeBedrockCredentials(credentials, fetcher);
      expect(result.valid).toBe(valid);
      if (!valid) expect(result.error).toContain(errorType);
      const [url, options] = fetcher.mock.calls[0];
      expect(url).toBe("https://bedrock.us-east-1.amazonaws.com/foundation-models");
      expect(options).toMatchObject({ method: "GET", redirect: "error" });
      expect(options.headers.Authorization).toMatch(/Credential=AKIAEXAMPLE\/\d{8}\/us-east-1\/bedrock\/aws4_request/);
    },
  );
  it.each([
    [{ apiKey: "secret-only", providerSpecificData: {} }, /static credentials are incomplete/],
    [{ ...credentials, providerSpecificData: { ...credentials.providerSpecificData, region: "evil.com/x" } }, /Invalid AWS region/],
  ])("rejects unusable credentials without network access", async (input, error) => {
    const fetcher = vi.fn();
    expect(await probeBedrockCredentials(input, fetcher)).toMatchObject({ valid: false, error: expect.stringMatching(error) });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["bedrock", "bedrock-xai"])("validates %s static keys through the real route", async (provider) => {
    const fetcher = vi.fn(async () => awsResponse(200));
    vi.stubGlobal("fetch", fetcher);
    const response = await validate(new Request("https://router.local/api/providers/validate", {
      method: "POST", body: JSON.stringify({ provider, ...credentials }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true, error: null });
    expect(fetcher.mock.calls[0][0]).toBe("https://bedrock.us-east-1.amazonaws.com/foundation-models");
  });
  it.each(["bedrock", "bedrock-xai"])("accepts %s profile shape without a secret and rejects unsafe profiles before fetch", async (provider) => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const response = await validate(new Request("https://router.local/api/providers/validate", {
      method: "POST", body: JSON.stringify({ provider, providerSpecificData: { profile: "../invalid" } }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ valid: false, error: expect.stringMatching(/Invalid AWS profile/) });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["   ", 123, {}])("rejects an invalid profile-only validation shape %j", async (profile) => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const response = await validate(new Request("https://router.local/api/providers/validate", {
      method: "POST", body: JSON.stringify({ provider: "bedrock", providerSpecificData: { profile } }),
    }));
    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["bedrock", "bedrock-xai"])("tests saved %s connections using their proxy", async (provider) => {
    proxyAwareFetch.mockResolvedValue(awsResponse(403, "AccessDeniedException"));
    const proxy = { connectionProxyEnabled: true, connectionProxyUrl: "http://proxy.local:3128" };
    expect(await testApiKeyConnection({ provider, ...credentials }, proxy)).toEqual({ valid: true, error: null });
    expect(proxyAwareFetch).toHaveBeenCalledWith("https://bedrock.us-east-1.amazonaws.com/foundation-models", expect.objectContaining({
      method: "GET", headers: expect.objectContaining({ Authorization: expect.stringContaining("AWS4-HMAC-SHA256") }),
    }), expect.objectContaining(proxy));
  });
  it("bounds a stalled control-plane probe", async () => {
    vi.useFakeTimers();
    let started;
    const ready = new Promise((resolve) => { started = resolve; });
    const pending = probeBedrockCredentials(credentials, (_url, init) => {
      started();
      return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }));
    });
    await ready;
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toMatchObject({ valid: false, error: expect.stringMatching(/timed out/i) });
  });
});

// Execute the real JSX with controlled hooks, following wave-c-quota-ui.test.js.
function modalHarness(file, props) {
  const states = []; let cursor = 0; let effects = [];
  const testReact = { ...React,
    useState: (initial) => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], (next) => { states[i] = next; }]; },
    useEffect: (effect) => { effects.push(effect); },
  };
  const Stub = () => null;
  const shared = { Button: Stub, Badge: Stub, Input: Stub, Modal: Stub, Select: Stub };
  const code = transformSync(readFileSync(new URL(file, import.meta.url), "utf8"), {
    filename: file, presets: [[presetReact, { runtime: "classic" }]], plugins: [transformModulesCommonjs],
  }).code;
  const mod = { exports: {} };
  new Function("require", "module", "exports", "React", code)((name) => {
    if (name === "react") return testReact;
    if (name === "@/shared/constants/providers") return providers;
    if (name === "@/shared/components") return shared;
    if (name.startsWith("@/shared/components/")) return { __esModule: true, default: Stub };
    if (name === "@/shared/utils/bulkAdd") return { planBulkAdd: vi.fn() };
    if (name === "@/shared/constants/uaPresets") return { presetForUserAgent: () => ({ preset: "default", custom: "" }), resolveNodeUserAgent: () => "" };
    if (name === "prop-types") return { __esModule: true, default: PropTypes };
    throw new Error(`Unexpected modal import ${name}`);
  }, mod, mod.exports, testReact);
  const render = () => { cursor = 0; effects = []; return mod.exports.default(props); };
  render(); effects.forEach((effect) => effect());
  return { render };
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) { const found = find(child, predicate); if (found) return found; }
  return null;
}
const input = (tree, label) => find(tree, (node) => node.props?.label?.startsWith(label));

describe("AWS dashboard credential forms", () => {
  it("requires both static key fields and sends an optional temporary session token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ valid: true })));
    const onSave = vi.fn();
    const modal = modalHarness("../../src/app/(dashboard)/dashboard/providers/[id]/AddApiKeyModal.js", { isOpen: true, provider: "bedrock", onSave });
    input(modal.render(), "Name").props.onChange({ target: { value: "Temporary account" } });
    input(modal.render(), "API Key").props.onChange({ target: { value: "synthetic-secret" } });
    expect(find(modal.render(), (node) => node.props?.children === "Save").props.disabled).toBeTruthy();
    input(modal.render(), "Access Key ID").props.onChange({ target: { value: "ASIAEXAMPLE" } });
    input(modal.render(), "Session Token").props.onChange({ target: { value: "temporary-token" } });
    const save = find(modal.render(), (node) => node.props?.children === "Save");
    expect(save.props.disabled).toBeFalsy();
    await save.props.onClick();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "synthetic-secret", providerSpecificData: { accessKeyId: "ASIAEXAMPLE", sessionToken: "temporary-token" } }));
  });
  it.each(["bedrock", "bedrock-xai"])("saves %s profile-only credentials without bulk mode", async (provider) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ valid: true })));
    const onSave = vi.fn();
    const modal = modalHarness("../../src/app/(dashboard)/dashboard/providers/[id]/AddApiKeyModal.js", { isOpen: true, provider, onSave });
    let tree = modal.render();
    const profile = input(tree, "AWS Profile");
    expect(profile).toBeTruthy();
    profile.props.onChange({ target: { value: " my-sso-profile " } });
    input(modal.render(), "Name").props.onChange({ target: { value: "SSO account" } });
    tree = modal.render();
    expect(find(tree, (node) => node.props?.children === "Bulk Add")).toBeNull();
    const save = find(tree, (node) => node.props?.children === "Save");
    expect(save.props.disabled).toBeFalsy();
    await save.props.onClick();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "", providerSpecificData: { profile: "my-sso-profile" } }));
  });
  it("edits AWS profile and token without reading the saved session secret", async () => {
    const onSave = vi.fn();
    const modal = modalHarness("../../src/shared/components/EditConnectionModal.js", { isOpen: true, connection: {
      id: "aws", provider: "bedrock-xai", authType: "apikey", providerSpecificData: { profile: "old-profile", region: "us-east-1" },
    }, onSave });
    let tree = modal.render();
    const profile = input(tree, "AWS Profile");
    expect(profile).toBeTruthy();
    expect(input(tree, "Session Token").props.value).toBe("");
    profile.props.onChange({ target: { value: " new-profile " } });
    tree = modal.render();
    await find(tree, (node) => node.props?.children === "Save").props.onClick();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ providerSpecificData: expect.objectContaining({ profile: "new-profile", sessionToken: "" }) }));
    find(tree, (node) => node.type === "input" && node.props.type === "checkbox").props.onChange({ target: { checked: true } });
    tree = modal.render();
    expect(input(tree, "Session Token").props.disabled).toBe(true);
    await find(tree, (node) => node.props?.children === "Save").props.onClick();
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ providerSpecificData: expect.objectContaining({ sessionToken: null }) }));
  });
});
