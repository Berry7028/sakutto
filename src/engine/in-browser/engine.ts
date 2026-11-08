import { PromptEngine, type PromptEngineOptions } from '../prompt/engine';
import type { LlamaRuntime } from './runtime';

export type InBrowserEngineOptions = Omit<PromptEngineOptions, 'kind'>;

/**
 * The in-browser PLaMo engine. The translation loop lives in `PromptEngine`; this class
 * only binds it to the wllama runtime, so the Ollama engine can share the same planning,
 * batching, and glossary behaviour.
 */
export class InBrowserEngine extends PromptEngine {
  constructor(runtime: LlamaRuntime, options: InBrowserEngineOptions = {}) {
    super(runtime, { ...options, kind: 'plamo' });
  }
}
