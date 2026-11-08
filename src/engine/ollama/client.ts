import { abortError, EngineError, isAbortError } from '../errors';
import { TRANSLATION_STOP_TOKENS } from '../prompt/pfml3';
import { isRecord } from '@/shared/object';

/** How long the first byte, or a `/api/tags` answer, may take. */
export const OLLAMA_CONNECT_TIMEOUT_MS = 4_000;
export const OLLAMA_PROBE_TIMEOUT_MS = 1_500;

export interface OllamaClientOptions {
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
}

export interface OllamaGenerateRequest {
  prompt: string;
  maxTokens: number;
  numCtx: number;
  signal: AbortSignal;
  onToken: (text: string) => void;
}

interface OpenResponse {
  response: Response;
  close(): void;
}

function parseRecord(line: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(line);
    if (isRecord(value)) return value;
  } catch {
    // Fall through to the error below.
  }
  throw new EngineError('ollama-failed', 'The Ollama server returned an unreadable stream.');
}

async function httpError(response: Response): Promise<EngineError> {
  let detail = '';
  try {
    const text = await response.text();
    try {
      const value: unknown = JSON.parse(text);
      if (isRecord(value) && typeof value.error === 'string') detail = value.error;
    } catch {
      detail = text;
    }
  } catch {
    // The status line is enough when the body cannot be read.
  }

  const trimmed = detail.trim().slice(0, 300);
  if (response.status === 404) {
    return new EngineError(
      'ollama-model-missing',
      trimmed.length > 0 ? trimmed : 'The model is not installed in Ollama.',
    );
  }
  return new EngineError(
    'ollama-failed',
    trimmed.length > 0 ? trimmed : `Ollama answered HTTP ${String(response.status)}.`,
  );
}

/**
 * Reads Ollama's newline-delimited JSON stream. A line is parsed as soon as it is complete,
 * so the first token reaches the page before the model has finished the paragraph.
 */
async function readNdjson(
  response: Response,
  onRecord: (record: Record<string, unknown>) => void,
  signal: AbortSignal,
): Promise<void> {
  if (!response.ok) throw await httpError(response);
  const body = response.body;
  if (!body) throw new EngineError('ollama-failed', 'The Ollama response had no body.');

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const drain = (): void => {
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.length > 0) onRecord(parseRecord(line));
      newline = buffer.indexOf('\n');
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      drain();
    }
    buffer += decoder.decode();
    drain();
    const tail = buffer.trim();
    if (tail.length > 0) onRecord(parseRecord(tail));
  } catch (error) {
    if (signal.aborted) throw abortError();
    if (isAbortError(error)) {
      throw new EngineError('ollama-unavailable', 'The Ollama stream stopped before it finished.');
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/** True when `model` is one of the names `/api/tags` reported. */
export function ollamaHasModel(names: readonly string[], model: string): boolean {
  const wanted = model.trim();
  if (wanted.length === 0) return false;
  const withLatest = wanted.includes(':') ? wanted : `${wanted}:latest`;
  return names.some((name) => name === wanted || name === withLatest);
}

export class OllamaClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OllamaClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/u, '');
    this.model = options.model;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get endpoint(): string {
    return this.baseUrl;
  }

  get modelName(): string {
    return this.model;
  }

  /**
   * Sends the PFML3 prompt to `/api/generate` with `raw: true`, which is the form the model
   * card recommends for Ollama: Ollama must not apply its own chat template to a prompt that
   * already carries the PLaMo tags.
   */
  async generate(request: OllamaGenerateRequest): Promise<void> {
    const opened = await this.open(
      '/api/generate',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: request.prompt,
          stream: true,
          raw: true,
          keep_alive: '30m',
          options: {
            temperature: 0,
            num_ctx: request.numCtx,
            num_predict: request.maxTokens,
            stop: [...TRANSLATION_STOP_TOKENS],
          },
        }),
      },
      request.signal,
      OLLAMA_CONNECT_TIMEOUT_MS,
    );

    try {
      await readNdjson(
        opened.response,
        (record) => {
          if (typeof record.error === 'string' && record.error.length > 0) {
            throw new EngineError('ollama-failed', record.error);
          }
          if (typeof record.response === 'string' && record.response.length > 0) {
            if (!request.signal.aborted) request.onToken(record.response);
          }
        },
        request.signal,
      );
    } finally {
      opened.close();
    }
  }

  async listModels(signal: AbortSignal): Promise<string[]> {
    const opened = await this.open('/api/tags', { method: 'GET' }, signal, OLLAMA_PROBE_TIMEOUT_MS);

    try {
      if (!opened.response.ok) throw await httpError(opened.response);
      const payload: unknown = await opened.response.json().catch(() => null);
      if (!isRecord(payload) || !Array.isArray(payload.models)) return [];

      const names: string[] = [];
      for (const entry of payload.models) {
        if (!isRecord(entry)) continue;
        if (typeof entry.name === 'string') names.push(entry.name);
        else if (typeof entry.model === 'string') names.push(entry.model);
      }
      return names;
    } finally {
      opened.close();
    }
  }

  /**
   * Opens a request and keeps its abort controller alive for the body. The connect timer is
   * cleared as soon as headers arrive, because a translation may stream for a long time.
   */
  private async open(
    path: string,
    init: RequestInit,
    signal: AbortSignal,
    timeoutMs: number,
  ): Promise<OpenResponse> {
    if (signal.aborted) throw abortError();

    const controller = new AbortController();
    const forward = (): void => controller.abort();
    signal.addEventListener('abort', forward, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const close = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', forward);
    };

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timer);
      return { response, close };
    } catch (error) {
      close();
      if (signal.aborted) throw abortError();
      if (isAbortError(error)) {
        throw new EngineError('ollama-unavailable', 'The Ollama server did not answer in time.', {
          cause: error,
        });
      }
      throw new EngineError('ollama-unavailable', 'The Ollama server could not be reached.', {
        cause: error,
      });
    }
  }
}
