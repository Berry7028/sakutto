import { describe, expect, it } from 'vitest';
import { EngineError } from '@/engine/errors';
import { OllamaClient, ollamaHasModel } from '@/engine/ollama/client';
import { OllamaEngine } from '@/engine/ollama/engine';
import type { TranslateOptions, TranslationChunk } from '@/engine/types';
import { collectChunks, streamOf } from './support/fakes';

interface FetchCall {
  url: string;
  init: RequestInit;
  body: Record<string, unknown> | null;
}

function fakeFetch(
  handler: (call: FetchCall) => Response | Promise<Response>,
): typeof fetch & { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    const call = { url: String(input), init: init ?? {}, body };
    calls.push(call);
    return handler(call);
  };
  return Object.assign(impl as unknown as typeof fetch, { calls });
}

function ndjson(lines: readonly string[]): Response {
  const encoder = new TextEncoder();
  return new Response(streamOf(lines.map((line) => encoder.encode(`${line}\n`))), {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' },
  });
}

function options(overrides: Partial<TranslateOptions> = {}): TranslateOptions {
  return {
    tgt: 'ja',
    form: 'polite',
    priority: 10,
    signal: new AbortController().signal,
    ...overrides,
  };
}

function finalChunks(chunks: readonly TranslationChunk[]): TranslationChunk[] {
  return chunks.filter((chunk) => chunk.final !== undefined);
}

describe('OllamaClient', () => {
  it('sends the raw PFML3 prompt and streams the response tokens', async () => {
    const fetchImpl = fakeFetch(() =>
      ndjson([
        '{"response":"こん","done":false}',
        '{"response":"にちは","done":false}',
        '{"response":"","done":true}',
      ]),
    );
    const client = new OllamaClient({
      baseUrl: 'http://127.0.0.1:11434',
      model: 'plamo-3-translate:2b',
      fetchImpl,
    });

    const tokens: string[] = [];
    await client.generate({
      prompt: '<|plamo:tag|>input<|plamo:msg|>Hello.',
      maxTokens: 128,
      numCtx: 4096,
      signal: new AbortController().signal,
      onToken: (text) => tokens.push(text),
    });

    expect(tokens).toEqual(['こん', 'にちは']);
    const call = fetchImpl.calls[0];
    expect(call?.url).toBe('http://127.0.0.1:11434/api/generate');
    expect(call?.body).toMatchObject({
      model: 'plamo-3-translate:2b',
      prompt: '<|plamo:tag|>input<|plamo:msg|>Hello.',
      stream: true,
      raw: true,
      options: {
        temperature: 0,
        num_ctx: 4096,
        num_predict: 128,
        stop: ['<|plamo:tag|>', '<|plamo:bos|>'],
      },
    });
  });

  it('reads a final JSON line that has no trailing newline', async () => {
    const encoder = new TextEncoder();
    const fetchImpl = fakeFetch(
      () =>
        new Response(
          streamOf([
            encoder.encode('{"response":"a","done":false}\n'),
            encoder.encode('{"response":"b","done":false}'),
          ]),
        ),
    );
    const client = new OllamaClient({
      baseUrl: 'http://127.0.0.1:11434',
      model: 'm',
      fetchImpl,
    });

    const tokens: string[] = [];
    await client.generate({
      prompt: 'p',
      maxTokens: 8,
      numCtx: 2048,
      signal: new AbortController().signal,
      onToken: (text) => tokens.push(text),
    });

    expect(tokens).toEqual(['a', 'b']);
  });

  it('maps a missing model to its own error code', async () => {
    const fetchImpl = fakeFetch(
      () =>
        new Response(JSON.stringify({ error: 'model "m" not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const client = new OllamaClient({
      baseUrl: 'http://127.0.0.1:11434',
      model: 'm',
      fetchImpl,
    });

    await expect(
      client.generate({
        prompt: 'p',
        maxTokens: 8,
        numCtx: 2048,
        signal: new AbortController().signal,
        onToken: () => undefined,
      }),
    ).rejects.toMatchObject({ code: 'ollama-model-missing' });
  });

  it('reports a refused connection as ollama-unavailable', async () => {
    const fetchImpl = fakeFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    const client = new OllamaClient({
      baseUrl: 'http://127.0.0.1:11434',
      model: 'm',
      fetchImpl,
    });

    await expect(client.listModels(new AbortController().signal)).rejects.toMatchObject({
      code: 'ollama-unavailable',
    });
  });

  it('keeps an abort distinct from a server failure', async () => {
    const controller = new AbortController();
    const fetchImpl = fakeFetch(() => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    const client = new OllamaClient({
      baseUrl: 'http://127.0.0.1:11434',
      model: 'm',
      fetchImpl,
    });

    await expect(client.listModels(controller.signal)).rejects.toMatchObject({ code: 'aborted' });
  });

  it('reads model names from /api/tags', async () => {
    const fetchImpl = fakeFetch(
      () =>
        new Response(
          JSON.stringify({
            models: [
              { name: 'plamo-3-translate:2b', model: 'plamo-3-translate:2b' },
              { model: 'other:latest' },
              { name: 42 },
            ],
          }),
          { status: 200 },
        ),
    );
    const client = new OllamaClient({
      baseUrl: 'http://127.0.0.1:11434/',
      model: 'm',
      fetchImpl,
    });

    await expect(client.listModels(new AbortController().signal)).resolves.toEqual([
      'plamo-3-translate:2b',
      'other:latest',
    ]);
    expect(fetchImpl.calls[0]?.url).toBe('http://127.0.0.1:11434/api/tags');
  });
});

describe('ollamaHasModel', () => {
  it('accepts the exact name and the implicit latest tag', () => {
    expect(ollamaHasModel(['plamo:latest'], 'plamo')).toBe(true);
    expect(ollamaHasModel(['plamo:2b'], 'plamo:2b')).toBe(true);
    expect(ollamaHasModel(['plamo:2b'], 'plamo')).toBe(false);
    expect(ollamaHasModel([], 'plamo')).toBe(false);
  });
});

describe('OllamaEngine', () => {
  function engine(
    fetchImpl: typeof fetch,
    config: { enabled: boolean; url: string; model: string } = {
      enabled: true,
      url: 'http://127.0.0.1:11434',
      model: 'plamo-3-translate:2b',
    },
  ): OllamaEngine {
    return new OllamaEngine({
      loadConfig: async () => config,
      fetchImpl,
    });
  }

  it('translates with the same PFML3 prompt as the in-browser engine', async () => {
    const prompts: string[] = [];
    const fetchImpl = fakeFetch((call) => {
      if (call.url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'plamo-3-translate:2b' }] }));
      }
      prompts.push(String(call.body?.prompt ?? ''));
      return ndjson(['{"response":"こんにちは","done":false}', '{"done":true}']);
    });
    const ollama = engine(fetchImpl);

    const chunks = await collectChunks(ollama.translate([{ id: 'a', text: 'Hello.' }], options()));

    expect(chunks.map((chunk) => chunk.textDelta ?? '').join('')).toBe('こんにちは');
    expect(finalChunks(chunks)).toEqual([{ id: 'a', final: 'こんにちは', engine: 'ollama' }]);
    expect(prompts[0]).toContain(
      '<|plamo:tag|>output<|plamo:key|>lang<|plamo:val|>ja<|plamo:key|>form<|plamo:val|>polite<|plamo:msg|>',
    );
  });

  it('reports ready, missing, and unreachable states without throwing', async () => {
    const ready = engine(
      fakeFetch(() => new Response(JSON.stringify({ models: [{ name: 'plamo-3-translate:2b' }] }))),
    );
    await expect(ready.probeNow()).resolves.toMatchObject({ state: 'ready' });

    const missing = engine(
      fakeFetch(() => new Response(JSON.stringify({ models: [{ name: 'other:latest' }] }))),
    );
    await expect(missing.probeNow()).resolves.toMatchObject({ state: 'model-missing' });

    const down = engine(
      fakeFetch(() => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(down.probeNow()).resolves.toMatchObject({ state: 'unreachable' });
  });

  it('does not probe when the reader kept the in-browser engine', async () => {
    const fetchImpl = fakeFetch(() => new Response('{}'));
    const ollama = engine(fetchImpl, {
      enabled: false,
      url: 'http://127.0.0.1:11434',
      model: 'plamo-3-translate:2b',
    });

    await expect(ollama.probeNow()).resolves.toMatchObject({ state: 'disabled' });
    expect(fetchImpl.calls).toHaveLength(0);
  });

  it('caches a probe, and drops it after a failed translation', async () => {
    const fetchImpl = fakeFetch((call) => {
      if (call.url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'plamo-3-translate:2b' }] }));
      }
      throw new TypeError('Failed to fetch');
    });
    const ollama = engine(fetchImpl);

    await ollama.probeNow();
    await ollama.probeNow();
    expect(fetchImpl.calls.filter((call) => call.url.endsWith('/api/tags'))).toHaveLength(1);

    await expect(
      collectChunks(ollama.translate([{ id: 'a', text: 'Hello.' }], options())),
    ).rejects.toBeInstanceOf(EngineError);

    await ollama.probeNow(true);
    expect(fetchImpl.calls.filter((call) => call.url.endsWith('/api/tags'))).toHaveLength(2);
  });

  it('fails the next block fast after the server refuses a connection', async () => {
    const fetchImpl = fakeFetch((call) => {
      if (call.url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'plamo-3-translate:2b' }] }));
      }
      throw new TypeError('Failed to fetch');
    });
    const ollama = engine(fetchImpl);

    await ollama.probeNow();
    await expect(
      collectChunks(ollama.translate([{ id: 'a', text: 'Hello.' }], options())),
    ).rejects.toMatchObject({ code: 'ollama-unavailable' });
    const attempts = fetchImpl.calls.filter((call) => call.url.endsWith('/api/generate')).length;

    await expect(
      collectChunks(ollama.translate([{ id: 'b', text: 'Hello again.' }], options())),
    ).rejects.toMatchObject({ code: 'ollama-unavailable' });
    expect(fetchImpl.calls.filter((call) => call.url.endsWith('/api/generate'))).toHaveLength(
      attempts,
    );
  });
});
