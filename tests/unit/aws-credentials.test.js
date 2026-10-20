import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let resolveAwsCredentials, resolveRegion, detectCredentialMode, clearAwsCredentialCache;
let BEDROCK, AWS_CREDENTIAL_MODE, AWS_CREDENTIAL_NO_EXPIRY_TTL_MS, AWS_CREDENTIAL_REFRESH_LEAD_MS;
beforeEach(async () => {
  ({ resolveAwsCredentials, resolveRegion, detectCredentialMode, clearAwsCredentialCache } =
    await import("../../open-sse/shared/awsCredentials.js"));
  ({ BEDROCK, AWS_CREDENTIAL_MODE, AWS_CREDENTIAL_NO_EXPIRY_TTL_MS, AWS_CREDENTIAL_REFRESH_LEAD_MS } =
    await import("../../open-sse/config/awsConstants.js"));
  clearAwsCredentialCache();
  vi.stubEnv("AWS_REGION", "");
  vi.stubEnv("AWS_DEFAULT_REGION", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

const staticKeys = () => ({ apiKey: "test-secret", providerSpecificData: { accessKeyId: "AKIATEST" } });
const profile = () => ({ providerSpecificData: { profile: "test-profile" } });
const resolvedKeys = { accessKeyId: "ASIATEST", secretAccessKey: "test-secret", sessionToken: "test-token" };

describe("AWS static credentials", () => {
  it("resolves static keys without loading the optional SDK", async () => {
    const loadCredentialProviders = vi.fn(() => { throw new Error("SDK absent"); });
    expect(await resolveAwsCredentials(staticKeys(), { loadCredentialProviders })).toEqual({
      accessKeyId: "AKIATEST", secretAccessKey: "test-secret", sessionToken: undefined,
      region: BEDROCK.defaultRegion, mode: AWS_CREDENTIAL_MODE.STATIC, expiresAt: null,
    });
    expect(loadCredentialProviders).not.toHaveBeenCalled();
  });

  it("passes temporary session tokens through", async () => {
    const input = staticKeys();
    input.providerSpecificData = { accessKeyId: "ASIATEST", sessionToken: "test-token" };
    expect(await resolveAwsCredentials(input)).toMatchObject(resolvedKeys);
  });

  it("rejects incomplete or temporary keys without a token", async () => {
    await expect(resolveAwsCredentials({ apiKey: "test-secret" })).rejects.toThrow(/incomplete/);
    const input = staticKeys();
    input.providerSpecificData.accessKeyId = "ASIATEST";
    await expect(resolveAwsCredentials(input)).rejects.toThrow(/sessionToken/);
  });

  it("observes key rotation without caching static secrets", async () => {
    const input = staticKeys();
    await resolveAwsCredentials(input);
    input.apiKey = "rotated-secret";
    expect((await resolveAwsCredentials(input)).secretAccessKey).toBe("rotated-secret");
  });

  it("prefers an explicitly named profile over stray keys", () => {
    expect(detectCredentialMode(staticKeys())).toBe(AWS_CREDENTIAL_MODE.STATIC);
    const input = staticKeys();
    input.providerSpecificData.profile = "test-profile";
    expect(detectCredentialMode(input)).toBe(AWS_CREDENTIAL_MODE.PROFILE);
  });

  it("uses explicit, environment, default-environment, then built-in region precedence", () => {
    const env = { AWS_REGION: `${BEDROCK.defaultRegion}-env`, AWS_DEFAULT_REGION: `${BEDROCK.defaultRegion}-fallback` };
    expect(resolveRegion({ providerSpecificData: { region: ` ${BEDROCK.defaultRegion} ` } }, env)).toBe(BEDROCK.defaultRegion);
    expect(resolveRegion({}, env)).toBe(env.AWS_REGION);
    expect(resolveRegion({}, { AWS_DEFAULT_REGION: env.AWS_DEFAULT_REGION })).toBe(env.AWS_DEFAULT_REGION);
    expect(resolveRegion({}, {})).toBe(BEDROCK.defaultRegion);
  });

  it("rejects region values that could redirect signed requests", () => {
    for (const region of ["evil.com/x", "../host", "bad?host", 42]) {
      expect(() => resolveRegion({ providerSpecificData: { region } }, {})).toThrow(/Invalid AWS region/);
    }
  });
});

describe("AWS lazy profile/SSO credentials", () => {
  it("reports a missing optional SDK clearly and leaves static mode usable", async () => {
    const loadCredentialProviders = vi.fn(async () => {
      throw Object.assign(new Error("Cannot find package '@aws-sdk/credential-providers'"), { code: "ERR_MODULE_NOT_FOUND" });
    });
    await expect(resolveAwsCredentials(profile(), { loadCredentialProviders }))
      .rejects.toThrow(/needs the @aws-sdk\/credential-providers package.*static/);
    expect((await resolveAwsCredentials(staticKeys(), { loadCredentialProviders })).accessKeyId).toBe("AKIATEST");
    expect(loadCredentialProviders).toHaveBeenCalledTimes(1);
  });

  it("resolves the named profile lazily through fromIni", async () => {
    const provider = vi.fn(async () => resolvedKeys);
    const fromIni = vi.fn(() => provider);
    const loadCredentialProviders = vi.fn(async () => ({ fromIni }));
    expect(await resolveAwsCredentials(profile(), { loadCredentialProviders })).toMatchObject({
      ...resolvedKeys, region: BEDROCK.defaultRegion, mode: AWS_CREDENTIAL_MODE.PROFILE,
    });
    expect(fromIni).toHaveBeenCalledWith({ profile: "test-profile" });
  });

  it("provides SSO login guidance and retries a failed resolution", async () => {
    const provider = vi.fn().mockRejectedValueOnce(new Error("SSO expired")).mockResolvedValueOnce(resolvedKeys);
    const loadCredentialProviders = async () => ({ fromIni: () => provider });
    await expect(resolveAwsCredentials(profile(), { loadCredentialProviders })).rejects.toThrow(/aws sso login --profile test-profile/);
    expect(await resolveAwsCredentials(profile(), { loadCredentialProviders })).toMatchObject(resolvedKeys);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("rejects an unusable SDK credential result", async () => {
    const loadCredentialProviders = async () => ({ fromIni: () => async () => ({ accessKeyId: "AKIA" }) });
    await expect(resolveAwsCredentials(profile(), { loadCredentialProviders })).rejects.toThrow(/without usable credentials/);
  });

  it("rejects invalid profile names before importing the SDK", async () => {
    const loadCredentialProviders = vi.fn();
    await expect(resolveAwsCredentials({ providerSpecificData: { profile: "../invalid" } }, { loadCredentialProviders }))
      .rejects.toThrow(/Invalid AWS profile/);
    expect(loadCredentialProviders).not.toHaveBeenCalled();
  });

  it("shares in-flight resolution without sharing the callers' regions", async () => {
    const provider = vi.fn(async () => resolvedKeys);
    const loadCredentialProviders = async () => ({ fromIni: () => provider });
    const other = profile();
    other.providerSpecificData.region = `${BEDROCK.defaultRegion}-other`;
    const [first, second] = await Promise.all([
      resolveAwsCredentials(profile(), { loadCredentialProviders }),
      resolveAwsCredentials(other, { loadCredentialProviders }),
    ]);
    expect(first.region).toBe(BEDROCK.defaultRegion);
    expect(second.region).toBe(other.providerSpecificData.region);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("bounds no-expiry caching with a short TTL", async () => {
    let time = 1000;
    const provider = vi.fn(async () => resolvedKeys);
    const opts = { now: () => time, loadCredentialProviders: async () => ({ fromIni: () => provider }) };
    await resolveAwsCredentials(profile(), opts);
    await resolveAwsCredentials(profile(), opts);
    expect(provider).toHaveBeenCalledTimes(1);
    time += AWS_CREDENTIAL_NO_EXPIRY_TTL_MS;
    await resolveAwsCredentials(profile(), opts);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("refreshes temporary credentials before their expiration", async () => {
    let time = 1000;
    const expiration = new Date(time + 60 * 60 * 1000);
    const provider = vi.fn(async () => ({ ...resolvedKeys, expiration }));
    const opts = { now: () => time, loadCredentialProviders: async () => ({ fromIni: () => provider }) };
    const first = await resolveAwsCredentials(profile(), opts);
    expect(first.expiresAt).toBe(expiration.getTime() - AWS_CREDENTIAL_REFRESH_LEAD_MS);
    time = first.expiresAt;
    await resolveAwsCredentials(profile(), opts);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("times out a hung SDK provider instead of wedging waiters", async () => {
    vi.useFakeTimers();
    const loadCredentialProviders = async () => ({ fromIni: () => () => new Promise(() => {}) });
    const assertion = expect(resolveAwsCredentials(profile(), { loadCredentialProviders, resolveTimeoutMs: 20 }))
      .rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(21);
    await assertion;
  });
});
