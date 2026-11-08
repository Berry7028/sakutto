import { isEngineError } from '../errors';
import {
  PromptEngine,
  type CompletionRequest,
  type CompletionRunner,
  type PromptEngineOptions,
} from '../prompt/engine';
import type { TranslateOptions, TranslateSegment, TranslationChunk } from '../types';
import type { OllamaStatus } from '@/shared/engine-status';
import { OLLAMA_CONTEXT_TOKENS } from '@/shared/settings';
import { OllamaClient, ollamaHasModel } from './client';

export interface OllamaConfig {
  enabled: boolean;
  url: string;
  model: string;
}

export interface OllamaEngineOptions {
  loadConfig: () => Promise<OllamaConfig>;
  fetchImpl?: typeof fetch;
  config?: PromptEngineOptions['config'];
  contextTokens?: number;
  scheduler?: PromptEngineOptions['scheduler'];
}

/** How long a `/api/tags` answer is trusted before the next status check asks again. */
const PROBE_TTL_MS = 5_000;
const PROBE_TIMEOUT_MS = 1_500;

function disabledStatus(config: OllamaConfig): OllamaStatus {
  return { enabled: false, url: config.url, model: config.model, state: 'disabled' };
}

/**
 * The runner reads the endpoint on every completion rather than capturing it at load time,
 * so changing the URL or model in the options page takes effect without reloading anything.
 */
class OllamaRunner implements CompletionRunner {
  readonly parallel = 1;

  constructor(private readonly options: OllamaEngineOptions) {}

  async complete(request: CompletionRequest): Promise<void> {
    const config = await this.options.loadConfig();
    const client = new OllamaClient({
      baseUrl: config.url,
      model: config.model,
      ...(this.options.fetchImpl ? { fetchImpl: this.options.fetchImpl } : {}),
    });

    await client.generate({
      prompt: request.prompt,
      maxTokens: request.maxTokens,
      numCtx: this.options.contextTokens ?? OLLAMA_CONTEXT_TOKENS,
      signal: request.signal,
      onToken: request.onToken,
    });
  }
}

/**
 * PLaMo served by a local Ollama. The prompt, planning, batching, and glossary handling are
 * the same as the in-browser engine; only the completion call differs.
 *
 * A failed request is not retried on another engine. The reader chose Ollama for its larger
 * checkpoint, so quietly replacing its output with the 0.8B in-browser model would hide the
 * difference rather than report it. The page keeps its source text and the popup says what
 * went wrong.
 */
export class OllamaEngine extends PromptEngine {
  private readonly options: OllamaEngineOptions;
  private cached: { key: string; at: number; status: OllamaStatus } | null = null;
  private probing: Promise<OllamaStatus> | null = null;

  constructor(options: OllamaEngineOptions) {
    super(new OllamaRunner(options), {
      kind: 'ollama',
      ...(options.config ? { config: options.config } : {}),
      contextTokens: options.contextTokens ?? OLLAMA_CONTEXT_TOKENS,
      ...(options.scheduler ? { scheduler: options.scheduler } : {}),
    });
    this.options = options;
  }

  /** The last probe, without touching the network. */
  status(): OllamaStatus {
    return this.cached?.status ?? { enabled: false, url: '', model: '', state: 'unknown' };
  }

  /**
   * Asks `/api/tags` whether the server is up and the configured model is installed. The
   * answer is cached briefly, so a page with many requests does not probe once per segment.
   * A probe never throws: an unreachable server is a status, not a failed translation.
   */
  probeNow(force = false): Promise<OllamaStatus> {
    if (this.probing) return this.probing;

    const task = this.runProbe(force).finally(() => {
      if (this.probing === task) this.probing = null;
    });
    this.probing = task;
    return task;
  }

  override async *translate(
    segments: readonly TranslateSegment[],
    options: TranslateOptions,
  ): AsyncIterable<TranslationChunk> {
    try {
      yield* super.translate(segments, options);
    } catch (error) {
      if (
        isEngineError(error) &&
        (error.code === 'ollama-unavailable' || error.code === 'ollama-model-missing')
      ) {
        this.cached = null;
      }
      throw error;
    }
  }

  private async runProbe(force: boolean): Promise<OllamaStatus> {
    const config = await this.options.loadConfig();
    if (!config.enabled) {
      this.cached = null;
      return disabledStatus(config);
    }

    const key = `${config.url}\n${config.model}`;
    const cached = this.cached;
    if (!force && cached && cached.key === key && Date.now() - cached.at < PROBE_TTL_MS) {
      return cached.status;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const client = new OllamaClient({
      baseUrl: config.url,
      model: config.model,
      ...(this.options.fetchImpl ? { fetchImpl: this.options.fetchImpl } : {}),
    });

    let status: OllamaStatus;
    try {
      const names = await client.listModels(controller.signal);
      status = {
        enabled: true,
        url: config.url,
        model: config.model,
        state: ollamaHasModel(names, config.model) ? 'ready' : 'model-missing',
      };
    } catch {
      status = { enabled: true, url: config.url, model: config.model, state: 'unreachable' };
    } finally {
      clearTimeout(timer);
    }

    this.cached = { key, at: Date.now(), status };
    return status;
  }
}
