/**
 * Multi-transport providers must keep the request body and selected endpoint on
 * the same wire format. MiniMax-M3 declares a Claude target for compatibility,
 * but an OpenAI client should use MiniMax's matching OpenAI transport without
 * an OpenAI -> Claude translation.
 * Regression: https://github.com/decolua/9router/issues/3418
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  executeMock,
  refreshWithRetryMock,
  translateRequestMock,
  handleNonStreamingResponseMock,
  requestLoggerMock,
} = vi.hoisted(() => ({
  executeMock: vi.fn(),
  refreshWithRetryMock: vi.fn(),
  translateRequestMock: vi.fn((sourceFormat, targetFormat, model, body) => ({
    ...body,
    model,
    _translatedFrom: sourceFormat,
    _translatedTo: targetFormat,
  })),
  handleNonStreamingResponseMock: vi.fn(async () => ({ success: true })),
  requestLoggerMock: {
    logClientRawRequest: vi.fn(),
    logRawRequest: vi.fn(),
    logTargetRequest: vi.fn(),
    logError: vi.fn(),
  },
}));

vi.mock("../../open-sse/executors/index.js", () => ({
  getExecutor: vi.fn(() => ({
    execute: executeMock,
    refreshCredentials: vi.fn().mockResolvedValue(null),
  })),
}));

vi.mock("../../open-sse/translator/index.js", () => ({
  translateRequest: translateRequestMock,
}));

vi.mock("../../open-sse/handlers/chatCore/nonStreamingHandler.js", () => ({
  handleNonStreamingResponse: handleNonStreamingResponseMock,
}));

vi.mock("../../open-sse/utils/requestLogger.js", () => ({
  createRequestLogger: vi.fn(async () => requestLoggerMock),
}));

vi.mock("../../open-sse/utils/clientDetector.js", () => ({
  detectClientTool: vi.fn(() => null),
  isNativePassthrough: vi.fn(() => false),
}));

vi.mock("../../open-sse/utils/bypassHandler.js", () => ({
  handleBypassRequest: vi.fn(() => null),
}));

vi.mock("../../open-sse/utils/streamHandler.js", () => ({
  createStreamController: vi.fn(() => ({
    signal: undefined,
    handleComplete: vi.fn(),
    handleError: vi.fn(),
  })),
}));

vi.mock("../../open-sse/services/tokenRefresh.js", () => ({
  refreshWithRetry: refreshWithRetryMock,
}));

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  default: vi.fn(),
  proxyAwareFetch: vi.fn(),
}));

vi.mock("../../open-sse/translator/formats/claude.js", () => ({
  normalizeClaudePassthrough: vi.fn(),
  anchorClaudeCache: vi.fn(),
}));

vi.mock("../../open-sse/utils/toolDeduper.js", () => ({
  dedupeTools: vi.fn((tools) => ({ tools, stripped: [] })),
}));

vi.mock("../../open-sse/rtk/caveman.js", () => ({ injectCaveman: vi.fn() }));
vi.mock("../../open-sse/rtk/ponytail.js", () => ({ injectPonytail: vi.fn() }));
vi.mock("../../open-sse/rtk/index.js", () => ({
  compressMessages: vi.fn(() => null),
  formatRtkLog: vi.fn(() => ""),
}));
vi.mock("../../open-sse/rtk/headroom.js", () => ({
  compressWithHeadroom: vi.fn(async () => null),
  formatHeadroomLog: vi.fn(() => ""),
  formatHeadroomSizeLog: vi.fn(() => ""),
  isHeadroomPhantomSavings: vi.fn(() => false),
}));
vi.mock("../../open-sse/rtk/pxpipe.js", () => ({
  compressWithPxpipe: vi.fn(async () => ({ body: null, summary: null })),
}));

vi.mock("../../open-sse/translator/concerns/prefetch.js", () => ({
  prefetchRemoteImages: vi.fn(async () => 0),
}));

vi.mock("../../open-sse/handlers/chatCore/requestDetail.js", () => ({
  buildRequestDetail: vi.fn((detail) => detail),
  extractRequestConfig: vi.fn((body, stream) => ({ body, stream })),
}));

vi.mock("../../open-sse/utils/error.js", () => ({
  createErrorResult: vi.fn((status, message) => ({ success: false, status, error: message })),
  formatProviderError: vi.fn((error) => error.message),
  parseUpstreamError: vi.fn(async (response) => ({
    statusCode: response.status,
    message: (await response.json()).error,
  })),
}));

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(() => Promise.resolve()),
  saveRequestDetail: vi.fn(() => Promise.resolve()),
}));

function makeOptions(body) {
  return {
    body,
    modelInfo: { provider: "minimax-cn", model: "MiniMax-M3" },
    credentials: { apiKey: "test-api-key", providerSpecificData: {} },
    clientRawRequest: {
      endpoint: "/v1/chat/completions",
      body,
      headers: { accept: "application/json" },
    },
    connectionId: "test-connection",
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

describe("MiniMax-M3 multi-transport routing", () => {
  beforeEach(() => {
    executeMock.mockReset();
    refreshWithRetryMock.mockReset();
    translateRequestMock.mockClear();
    handleNonStreamingResponseMock.mockClear();
    requestLoggerMock.logTargetRequest.mockClear();
    requestLoggerMock.logError.mockClear();
    executeMock.mockResolvedValue({
      response: new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      url: "https://api.minimaxi.com/v1/chat/completions",
      headers: {},
      transformedBody: {},
    });
  });

  it("keeps OpenAI image blocks on the matching OpenAI transport", async () => {
    const imageBlock = {
      type: "image_url",
      image_url: { url: "data:image/png;base64,AAAB" },
    };
    const body = {
      model: "minimax-cn/MiniMax-M3",
      stream: false,
      messages: [{
        role: "user",
        content: [{ type: "text", text: "Describe this image" }, imageBlock],
      }],
    };

    const { handleChatCore } = await import("../../open-sse/handlers/chatCore.js");
    await handleChatCore(makeOptions(body));

    expect(translateRequestMock).toHaveBeenCalledWith(
      "openai",
      "openai",
      "MiniMax-M3",
      expect.any(Object),
      false,
      expect.any(Object),
      "minimax-cn",
      expect.any(Object),
      expect.anything(),
      "test-connection",
      null,
    );
    expect(executeMock).toHaveBeenCalledTimes(1);
    const requestBody = executeMock.mock.calls[0][0].body;
    expect(requestBody.messages[0].content).toContainEqual(imageBlock);
    expect(requestBody._translatedTo).toBe("openai");
    expect(requestBody).not.toHaveProperty("system");
    expect(executeMock.mock.calls[0][0].credentials.runtimeTransport.format).toBe("openai");
  });

  it("uses a failed retry's response and metadata instead of the original 401", async () => {
    refreshWithRetryMock.mockResolvedValue({ accessToken: "new-token" });
    executeMock
      .mockResolvedValueOnce({
        response: new Response(JSON.stringify({ error: "expired" }), { status: 401 }),
        url: "https://old.example/v1/chat/completions",
        headers: { authorization: "Bearer old-token" },
        transformedBody: { attempt: "initial" },
        responseFormat: "initial-format",
      })
      .mockResolvedValueOnce({
        response: new Response(JSON.stringify({ error: "still denied" }), { status: 403 }),
        url: "https://new.example/v1/messages",
        headers: { authorization: "Bearer new-token", "x-retry": "1" },
        transformedBody: { attempt: "retry" },
        responseFormat: "retry-format",
      });

    const { handleChatCore } = await import("../../open-sse/handlers/chatCore.js");
    const result = await handleChatCore(makeOptions({
      model: "minimax-cn/MiniMax-M3",
      stream: false,
      messages: [{ role: "user", content: "hello" }],
    }));

    expect(result.success).toBe(false);
    expect(result.status).toBe(403);
    expect(requestLoggerMock.logTargetRequest).toHaveBeenNthCalledWith(
      2,
      "https://new.example/v1/messages",
      { authorization: "Bearer new-token", "x-retry": "1" },
      { attempt: "retry" },
    );
    expect(requestLoggerMock.logError).toHaveBeenCalledWith(
      expect.any(Error),
      { attempt: "retry" },
    );
  });

  it("passes a successful retry's response format and transformed request downstream", async () => {
    refreshWithRetryMock.mockResolvedValue({ accessToken: "new-token" });
    executeMock
      .mockResolvedValueOnce({
        response: new Response("{}", { status: 401 }),
        url: "https://old.example/v1/chat/completions",
        headers: { authorization: "Bearer old-token" },
        transformedBody: { attempt: "initial" },
        responseFormat: "initial-format",
      })
      .mockResolvedValueOnce({
        response: new Response("{}", { status: 200 }),
        url: "https://new.example/v1/messages",
        headers: { authorization: "Bearer new-token" },
        transformedBody: { attempt: "retry" },
        responseFormat: "retry-format",
      });

    const { handleChatCore } = await import("../../open-sse/handlers/chatCore.js");
    await handleChatCore(makeOptions({
      model: "minimax-cn/MiniMax-M3",
      stream: false,
      messages: [{ role: "user", content: "hello" }],
    }));

    expect(handleNonStreamingResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerResponse: expect.any(Response),
        finalBody: { attempt: "retry" },
        targetFormat: "retry-format",
      }),
    );
  });
});
