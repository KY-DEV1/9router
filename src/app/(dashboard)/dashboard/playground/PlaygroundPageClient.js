"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Input } from "@/shared/components";

const NO_KEY = "__local_no_key__";

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      return typeof part?.text === "string" ? part.text : "";
    }).join("");
  }
  if (typeof content === "object" && typeof content.text === "string") return content.text;
  return String(content);
}

function getErrorMessage(data, status) {
  const error = data?.error;
  const message = typeof error === "string"
    ? error
    : error?.message || data?.message;
  if (typeof message === "string" && message.trim()) return message.trim().slice(0, 500);
  return `Request failed (${status})`;
}

function readSseChunk(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return { done: payload === "[DONE]" };
  try {
    return { chunk: JSON.parse(payload) };
  } catch {
    return null;
  }
}

export default function PlaygroundPageClient() {
  const [keyChoices, setKeyChoices] = useState([]);
  const [selectedKeyId, setSelectedKeyId] = useState(NO_KEY);
  const [keysLoaded, setKeysLoaded] = useState(false);
  const [keysError, setKeysError] = useState("");
  const apiKeyByIdRef = useRef(new Map());

  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful assistant.");
  const [prompt, setPrompt] = useState("");
  const [temperature, setTemperature] = useState("0.7");
  const [maxTokens, setMaxTokens] = useState("1024");
  const [streaming, setStreaming] = useState(true);

  const [answer, setAnswer] = useState("");
  const [responseError, setResponseError] = useState("");
  const [usage, setUsage] = useState(null);
  const [finishReason, setFinishReason] = useState("");
  const [elapsedMs, setElapsedMs] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadKeys() {
      setKeysError("");
      try {
        const response = await fetch("/api/keys", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || `Could not load API keys (${response.status})`);

        const activeKeys = (Array.isArray(data.keys) ? data.keys : [])
          .filter((key) => key?.isActive !== false && key?.id && key?.key)
          .map((key) => ({ id: key.id, name: key.name || "API key" }));
        const rawKeys = new Map(
          (Array.isArray(data.keys) ? data.keys : [])
            .filter((key) => key?.isActive !== false && key?.id && key?.key)
            .map((key) => [key.id, key.key])
        );

        if (!cancelled) {
          apiKeyByIdRef.current = rawKeys;
          setKeyChoices(activeKeys);
          setKeysLoaded(true);
        }
      } catch (error) {
        if (!cancelled) {
          apiKeyByIdRef.current = new Map();
          setKeyChoices([]);
          setKeysError(error?.message || "Could not load saved API keys.");
          setKeysLoaded(true);
        }
      }
    }

    loadKeys();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!keysLoaded) return undefined;
    const controller = new AbortController();
    const apiKey = selectedKeyId === NO_KEY ? "" : apiKeyByIdRef.current.get(selectedKeyId) || "";

    async function loadModels() {
      setModelsLoading(true);
      setModelsError("");
      setModels([]);
      const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
      try {
        const response = await fetch("/v1/models", {
          cache: "no-store",
          headers,
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 401 && !apiKey) {
            throw new Error("Choose an active API key to load models from a remote dashboard, or use local mode with API-key protection disabled.");
          }
          throw new Error(getErrorMessage(data, response.status));
        }

        const unique = new Map();
        for (const item of Array.isArray(data?.data) ? data.data : []) {
          if (typeof item?.id === "string" && item.id.trim() && !unique.has(item.id)) {
            unique.set(item.id, { id: item.id, owner: item.owned_by || "model" });
          }
        }
        const nextModels = Array.from(unique.values()).sort((a, b) => a.id.localeCompare(b.id));
        if (!controller.signal.aborted) {
          setModels(nextModels);
          setModel((current) => nextModels.some((item) => item.id === current) ? current : (nextModels[0]?.id || ""));
          if (nextModels.length === 0) setModelsError("No chat models are available for this key yet. Connect a provider or check the key's model restrictions.");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setModelsError(error?.message || "Could not load models.");
        }
      } finally {
        if (!controller.signal.aborted) setModelsLoading(false);
      }
    }

    loadModels();
    return () => controller.abort();
  }, [keysLoaded, selectedKeyId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const modelHints = useMemo(() => models.slice(0, 500), [models]);
  const selectedKeyName = keyChoices.find((key) => key.id === selectedKeyId)?.name || "";

  const handleSend = async (event) => {
    event.preventDefault();
    const chosenModel = model.trim();
    const userPrompt = prompt.trim();
    if (!chosenModel || !userPrompt || isSending) return;

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const startedAt = performance.now();
    const apiKey = selectedKeyId === NO_KEY ? "" : apiKeyByIdRef.current.get(selectedKeyId) || "";
    const headers = { "Content-Type": "application/json", Accept: streaming ? "text/event-stream" : "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const messages = [];
    if (systemPrompt.trim()) messages.push({ role: "system", content: systemPrompt.trim() });
    messages.push({ role: "user", content: userPrompt });

    const parsedTemperature = Number(temperature);
    const parsedMaxTokens = Number.parseInt(maxTokens, 10);
    const body = {
      model: chosenModel,
      messages,
      stream: streaming,
      ...(Number.isFinite(parsedTemperature) ? { temperature: parsedTemperature } : {}),
      ...(Number.isFinite(parsedMaxTokens) && parsedMaxTokens > 0 ? { max_tokens: parsedMaxTokens } : {}),
    };

    setIsSending(true);
    setAnswer("");
    setUsage(null);
    setFinishReason("");
    setElapsedMs(null);
    setResponseError("");
    setCopied(false);

    try {
      const response = await fetch("/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") || "";

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(getErrorMessage(data, response.status));
      }

      if (!streaming || !response.body || !contentType.includes("text/event-stream")) {
        const data = await response.json().catch(() => ({}));
        const choice = data?.choices?.[0];
        setAnswer(textFromContent(choice?.message?.content || data?.output_text || ""));
        setUsage(data?.usage || null);
        setFinishReason(choice?.finish_reason || "");
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedText = "";
        let streamUsage = null;
        let streamFinishReason = "";
        let streamError = "";

        const consumeLine = (line) => {
          const parsed = readSseChunk(line);
          if (!parsed?.chunk) return;
          const chunk = parsed.chunk;
          if (chunk?.error) {
            streamError = getErrorMessage(chunk, response.status);
            return;
          }
          const choice = chunk?.choices?.[0];
          const piece = textFromContent(choice?.delta?.content ?? choice?.message?.content);
          if (piece) {
            accumulatedText += piece;
            setAnswer(accumulatedText);
          }
          if (chunk?.usage) streamUsage = chunk.usage;
          if (choice?.finish_reason) streamFinishReason = choice.finish_reason;
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || "";
          for (const line of lines) consumeLine(line);
        }
        buffer += decoder.decode();
        if (buffer.trim()) consumeLine(buffer);
        if (streamError) throw new Error(streamError);
        setUsage(streamUsage);
        setFinishReason(streamFinishReason);
      }
    } catch (error) {
      if (error?.name !== "AbortError") setResponseError(error?.message || "Request failed.");
    } finally {
      setElapsedMs(Math.round(performance.now() - startedAt));
      setIsSending(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const handleStop = () => abortRef.current?.abort();

  const handleClear = () => {
    abortRef.current?.abort();
    setPrompt("");
    setAnswer("");
    setResponseError("");
    setUsage(null);
    setFinishReason("");
    setElapsedMs(null);
  };

  const handleCopy = async () => {
    if (!answer) return;
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setResponseError("Clipboard access is unavailable in this browser.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 ring-1 ring-brand-500/15 dark:text-brand-300">
            <span className="material-symbols-outlined text-[25px]">science</span>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">ROUTER WORKBENCH</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-main sm:text-3xl">Playground</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">Try a prompt against your configured models and inspect the live response.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default" size="sm">OpenAI-compatible</Badge>
          <Badge variant={selectedKeyId === NO_KEY ? "warning" : "success"} size="sm">
            {selectedKeyId === NO_KEY ? "Local mode" : "Key selected"}
          </Badge>
        </div>
      </header>

      <form onSubmit={handleSend} className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
        <div className="space-y-5">
          <Card padding="md" title="Request setup" subtitle="Choose a route and tune the generation." icon="tune">
            <div className="space-y-5">
              <div>
                <label htmlFor="playground-key" className="mb-1.5 block text-sm font-medium text-text-main">API key</label>
                <select
                  id="playground-key"
                  value={selectedKeyId}
                  onChange={(event) => setSelectedKeyId(event.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[16px] text-text-main shadow-sm transition focus:border-brand-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/20 sm:text-sm"
                >
                  <option value={NO_KEY}>No key — local mode</option>
                  {keyChoices.map((key) => <option key={key.id} value={key.id}>{key.name}</option>)}
                </select>
                <p className="mt-1.5 text-xs leading-5 text-text-muted">
                  {selectedKeyId === NO_KEY
                    ? "Remote dashboards and API-key-protected setups need an active key."
                    : `Requests use “${selectedKeyName}”; its model restrictions are enforced.`}
                  {keysError ? ` ${keysError}` : " Saved key material stays in memory for this page only."}
                </p>
              </div>

              <div>
                <label htmlFor="playground-model" className="mb-1.5 block text-sm font-medium text-text-main">Model or combo</label>
                <Input
                  id="playground-model"
                  list="playground-model-options"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder={modelsLoading ? "Loading available models…" : "Select or type a model ID"}
                  autoComplete="off"
                  inputClassName="font-mono"
                  hint={modelsError || (modelsLoading ? "Loading models allowed by this key…" : `${models.length} routable model${models.length === 1 ? "" : "s"} available for this key. You can also type an ID directly.`)}
                />
                <datalist id="playground-model-options">
                  {modelHints.map((item) => <option key={item.id} value={item.id}>{item.owner}</option>)}
                </datalist>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="playground-temperature"
                  label="Temperature"
                  aria-label="Temperature"
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(event) => setTemperature(event.target.value)}
                  hint="0 = more focused · 2 = more varied"
                />
                <Input
                  id="playground-max-tokens"
                  label="Max output tokens"
                  aria-label="Max output tokens"
                  type="number"
                  min="1"
                  max="200000"
                  step="1"
                  value={maxTokens}
                  onChange={(event) => setMaxTokens(event.target.value)}
                  hint="Leave blank to use the model default."
                />
              </div>

              <div>
                <label htmlFor="playground-system" className="mb-1.5 block text-sm font-medium text-text-main">System prompt <span className="font-normal text-text-muted">(optional)</span></label>
                <textarea
                  id="playground-system"
                  value={systemPrompt}
                  onChange={(event) => setSystemPrompt(event.target.value)}
                  rows={3}
                  placeholder="Set the assistant's behavior…"
                  className="w-full resize-y rounded-xl border border-border bg-surface px-3 py-2.5 text-sm leading-6 text-text-main shadow-sm outline-none transition placeholder:text-text-muted/70 focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border-subtle bg-bg-alt/60 px-3.5 py-3">
                <span>
                  <span className="block text-sm font-medium text-text-main">Stream response</span>
                  <span className="mt-0.5 block text-xs text-text-muted">Show output as it arrives.</span>
                </span>
                <input
                  type="checkbox"
                  checked={streaming}
                  onChange={(event) => setStreaming(event.target.checked)}
                  className="size-4 accent-brand-600"
                />
              </label>
            </div>
          </Card>

          <Card padding="md" title="Your prompt" subtitle="Each run sends the system prompt and this message." icon="edit_note">
            <div className="space-y-4">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={7}
                placeholder="Ask the selected model something…"
                aria-label="Your prompt"
                className="w-full resize-y rounded-xl border border-border bg-surface px-4 py-3 text-[15px] leading-7 text-text-main shadow-sm outline-none transition placeholder:text-text-muted/70 focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-text-muted">POST <code className="rounded bg-bg-alt px-1.5 py-0.5 font-mono text-text-main">/v1/chat/completions</code></span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" onClick={handleClear} disabled={isSending && !answer && !prompt}>Clear</Button>
                  {isSending ? (
                    <Button type="button" variant="secondary" icon="stop" onClick={handleStop}>Stop</Button>
                  ) : (
                    <Button type="submit" icon="send" disabled={!model.trim() || !prompt.trim()}>Run prompt</Button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Card padding="md" title="Response" subtitle="Live output from the selected model." icon="forum" className="min-w-0 xl:sticky xl:top-5">
          <div className="mb-4 flex min-h-7 flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
              {elapsedMs !== null && <span>{elapsedMs} ms</span>}
              {finishReason && <span className="rounded-lg bg-bg-alt px-2 py-1">Finish: {finishReason}</span>}
              {usage?.total_tokens != null && <span className="rounded-lg bg-bg-alt px-2 py-1">{usage.total_tokens} tokens</span>}
            </div>
            <Button type="button" variant="ghost" size="sm" icon={copied ? "check" : "content_copy"} onClick={handleCopy} disabled={!answer}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          {responseError ? (
            <div role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-3 text-sm leading-6 text-red-700 dark:text-red-300">
              <div className="flex items-start gap-2"><span className="material-symbols-outlined mt-0.5 text-[18px]">error</span><p className="break-words">{responseError}</p></div>
            </div>
          ) : null}

          <div aria-live="polite" aria-label="Model response" className="min-h-[300px] overflow-auto rounded-xl border border-border-subtle bg-bg-alt/65 p-4 sm:min-h-[430px]">
            {answer ? (
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-text-main">{answer}</pre>
            ) : isSending ? (
              <div className="flex items-center gap-3 text-sm text-text-muted"><span className="size-2 animate-pulse rounded-full bg-brand-500" />Waiting for model output…</div>
            ) : (
              <div className="flex min-h-[260px] flex-col items-center justify-center px-4 text-center sm:min-h-[390px]">
                <div className="mb-3 flex size-12 items-center justify-center rounded-2xl border border-border-subtle bg-surface text-brand-600 dark:text-brand-300"><span className="material-symbols-outlined text-[24px]">terminal</span></div>
                <p className="text-sm font-medium text-text-main">Ready when you are</p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-text-muted">Choose a model, write a prompt, then run it to see the response and request stats.</p>
              </div>
            )}
          </div>

          {usage ? (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                ["Input", usage.prompt_tokens],
                ["Output", usage.completion_tokens],
                ["Total", usage.total_tokens],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border-subtle bg-bg-alt/60 px-3 py-2.5 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-text-main">{Number.isFinite(value) ? value.toLocaleString() : "—"}</p>
                </div>
              ))}
            </div>
          ) : null}

          <p className="mt-4 text-[11px] leading-5 text-text-muted">This sends your prompt to the selected provider through the local 9Router gateway. Provider usage or charges may apply.</p>
        </Card>
      </form>
    </div>
  );
}
