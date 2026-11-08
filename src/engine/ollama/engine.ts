import { EngineError, isEngineError } from '../errors';
import {
  PromptEngine,
  type CompletionRequest,
  type CompletionRunner,
  type PromptEngineOptions,
} from '../prompt/engine';
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

function unavailableStatus(
  config: OllamaConfig,
  state: 'unreachable' | 'model-missing',
): OllamaStatus {
  return { enabled: true, url: config.url, model: config.model, state };
}

/**
 * The runner reads the endpoint on every completion rather than capturing it at load time,
 * so changing the URL or model in the options page takes effect without reloading anything.
 *
 * A failed connection is cached for the same short window as a successful probe. Without
 * that, a page with a hundred blocks would open a hundred failing connections before it
 * settled on the source text, and each one would wait for the connect timeout.
 */
class OllamaRunner implements CompletionRunner {
  readonly parallel = 1;

  private cached: { key: string; at: number; status: OllamaStatus } | null = null;
  private probing: Promise<OllamaStatus> | null = null;

  constructor(private readonly options: OllamaEngineOptions) {}

  status(): OllamaStatus {
    return this.cached?.status ?? { enabled: false, url: '', model: '', state: 'unknown' };
  }

  probeNow(force = false): Promise<OllamaStatus> {
    if (this.probing) return this.probing;

    const task = this.runProbe(force).finally(() => {
      if (this.probing === task) this.probing = null;
    });
    this.probing = task;
    return task;
  }

  async complete(request: CompletionRequest): Promise<void> {
    const config = await this.options.loadConfig();
    const key = `${config.url}\n${config.model}`;
    const cached = this.cached;
    if (cached && cached.key === key) {
      if (cached.status.state === 'unreachable') {
        throw new EngineError(
          'ollama-unavailable',
          `The Ollama server at ${config.url} did not answer.`,
        );
      }
      if (cached.status.state === 'model-missing') {
        throw new EngineError(
          'ollama-model-missing',
          `Ollama does not have the model ${config.model}.`,
        );
      }
    }

    const client = this.client(config);
    try {
      await client.generate({
        prompt: request.prompt,
        maxTokens: request.maxTokens,
        numCtx: this.options.contextTokens ?? OLLAMA_CONTEXT_TOKENS,
        signal: request.signal,
        onToken: request.onToken,
      });
    } catch (error) {
      if (
        isEngineError(error) &&
        (error.code === 'ollama-unavailable' || error.code === 'ollama-model-missing')
      ) {
        this.cached = {
          key,
          at: Date.now(),
          status: unavailableStatus(
            config,
            error.code === 'ollama-model-missing' ? 'model-missing' : 'unreachable',
          ),
        };
      }
      throw error;
    }
  }

  private client(config: OllamaConfig): OllamaClient {
    return new OllamaClient({
      baseUrl: config.url,
      model: config.model,
      ...(this.options.fetchImpl ? { fetchImpl: this.options.fetchImpl } : {}),
    });
  }

  private async runProbe(force: boolean): Promise<OllamaStatus> {
    let config: OllamaConfig;
    try {
      config = await this.options.loadConfig();
    } catch {
      return { enabled: false, url: '', model: '', state: 'unknown' };
    }

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

    let status: OllamaStatus;
    try {
      const names = await this.client(config).listModels(controller.signal);
      status = {
        enabled: true,
        url: config.url,
        model: config.model,
        state: ollamaHasModel(names, config.model) ? 'ready' : 'model-missing',
      };
    } catch {
      status = unavailableStatus(config, 'unreachable');
    } finally {
      clearTimeout(timer);
    }

    this.cached = { key, at: Date.now(), status };
    return status;
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
  private readonly ollamaRunner: OllamaRunner;

  constructor(options: OllamaEngineOptions) {
    const runner = new OllamaRunner(options);
    super(runner, {
      kind: 'ollama',
      ...(options.config ? { config: options.config } : {}),
      contextTokens: options.contextTokens ?? OLLAMA_CONTEXT_TOKENS,
      ...(options.scheduler ? { scheduler: options.scheduler } : {}),
    });
    this.ollamaRunner = runner;
  }

  /** The last probe, without touching the network. */
  status(): OllamaStatus {
    return this.ollamaRunner.status();
  }

  /**
   * Asks `/api/tags` whether the server is up and the configured model is installed. The
   * answer is cached briefly, so a page with many requests does not probe once per segment.
   * A probe never throws: an unreachable server is a status, not a failed translation.
   */
  probeNow(force = false): Promise<OllamaStatus> {
    return this.ollamaRunner.probeNow(force);
  }
}
