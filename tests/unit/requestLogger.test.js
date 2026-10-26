import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const originalLogging = process.env.ENABLE_REQUEST_LOGS;
const originalCwd = process.cwd();
let tempDir;

async function loadLogger() {
  // The module reads ENABLE_REQUEST_LOGS at import time.
  vi.resetModules();
  return import("../../open-sse/utils/requestLogger.js");
}

describe("request logger secret redaction", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-request-logger-"));
    process.chdir(tempDir);
    process.env.ENABLE_REQUEST_LOGS = "true";
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (originalLogging === undefined) delete process.env.ENABLE_REQUEST_LOGS;
    else process.env.ENABLE_REQUEST_LOGS = originalLogging;
  });

  it("redacts sensitive request and response headers and URL credentials", async () => {
    const { createRequestLogger } = await loadLogger();
    const logger = await createRequestLogger("openai", "provider", "model");

    logger.logClientRawRequest(
      "https://user:password@example.test/v1/chat?access_token=query-secret&safe=value",
      {},
    );
    logger.logTargetRequest(
      "https://example.test/v1/chat?api_key=query-key&keep=value",
      {
        Authorization: "Bearer request-secret",
        "Proxy-Authorization": "Basic proxy-secret",
        Cookie: "session=cookie-secret",
        "X-API-Key": "api-secret",
        "X-Refresh-Token": "refresh-secret",
        "X-Request-ID": "request-id",
      },
      {},
    );
    logger.logProviderResponse(200, "OK", new Headers({
      "Set-Cookie": "session=response-cookie-secret",
      "X-Provider-Token": "response-token-secret",
      "Content-Type": "application/json",
    }), {});

    const requestLog = JSON.parse(fs.readFileSync(path.join(logger.sessionPath, "1_req_client.json"), "utf8"));
    const targetLog = JSON.parse(fs.readFileSync(path.join(logger.sessionPath, "4_req_target.json"), "utf8"));
    const responseLog = JSON.parse(fs.readFileSync(path.join(logger.sessionPath, "5_res_provider.json"), "utf8"));
    const serialized = JSON.stringify({ requestLog, targetLog, responseLog });

    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("query-secret");
    expect(serialized).not.toContain("query-key");
    expect(serialized).not.toContain("request-secret");
    expect(serialized).not.toContain("proxy-secret");
    expect(serialized).not.toContain("cookie-secret");
    expect(serialized).not.toContain("api-secret");
    expect(serialized).not.toContain("refresh-secret");
    expect(serialized).not.toContain("response-cookie-secret");
    expect(serialized).not.toContain("response-token-secret");
    expect(targetLog.headers["X-Request-ID"]).toBe("request-id");
    expect(responseLog.headers["content-type"]).toBe("application/json");
    expect(targetLog.url).toContain("keep=value");
    expect(targetLog.url).toContain("%5BREDACTED%5D");
  });
});
