export type EngineErrorCode =
  | 'invalid-input'
  | 'unsupported-language'
  | 'model-missing'
  | 'model-integrity'
  | 'model-load-failed'
  | 'gpu-unavailable'
  | 'download-failed'
  | 'storage-insufficient'
  | 'chrome-unavailable'
  | 'chrome-not-ready'
  | 'offscreen-unavailable'
  | 'ollama-unavailable'
  | 'ollama-model-missing'
  | 'ollama-failed'
  | 'aborted'
  | 'unknown';

/**
 * The sentence shown for each failure. The onboarding card prints the model status's `error`
 * verbatim, so these are user-facing copy, not log lines: they are written in Japanese like
 * the rest of the interface.
 */
const ENGINE_ERROR_MESSAGES: Readonly<Record<EngineErrorCode, string>> = {
  'invalid-input': '翻訳できない入力です。',
  'unsupported-language': 'この言語の組み合わせには対応していません。',
  'model-missing': '翻訳モデルがまだこの端末にありません。',
  'model-integrity': 'ダウンロードしたモデルの検証に失敗しました。',
  'model-load-failed': '翻訳モデルを読み込めませんでした。',
  'gpu-unavailable': 'GPU を利用できませんでした。',
  'download-failed': 'モデルのダウンロードに失敗しました。',
  'storage-insufficient': 'モデルを保存する空き容量が足りません。',
  'chrome-unavailable': 'Chrome の内蔵翻訳を利用できません。',
  'chrome-not-ready': 'Chrome の内蔵翻訳の準備ができていません。',
  'offscreen-unavailable': '翻訳エンジンに接続できませんでした。',
  'ollama-unavailable': 'Ollama サーバーに接続できません。',
  'ollama-model-missing': 'Ollama にモデルがありません。',
  'ollama-failed': 'Ollama で翻訳に失敗しました。',
  aborted: '処理を中止しました。',
  unknown: '翻訳に失敗しました。',
};

/** The Japanese sentence for a failure code, with an optional detail appended in brackets. */
export function engineErrorMessage(code: EngineErrorCode, detail?: string): string {
  const message = ENGINE_ERROR_MESSAGES[code];
  const extra = detail?.trim() ?? '';
  return extra.length > 0 ? `${message}（${extra}）` : message;
}

export class EngineError extends Error {
  override readonly name = 'EngineError';
  readonly retryable: boolean;

  /**
   * `message` is the specific sentence for this failure. It is expected to be Japanese copy,
   * because the UI shows it as it is; `engineErrorMessage()` is the generic fallback.
   */
  constructor(
    readonly code: EngineErrorCode,
    message: string = engineErrorMessage(code),
    options?: { cause?: unknown; retryable?: boolean },
  ) {
    super(message);
    if (options && 'cause' in options) this.cause = options.cause;
    this.retryable = options?.retryable ?? true;
  }
}

export function isEngineError(value: unknown): value is EngineError {
  return value instanceof EngineError;
}

const ENGINE_ERROR_CODES: ReadonlySet<string> = new Set<EngineErrorCode>([
  'invalid-input',
  'unsupported-language',
  'model-missing',
  'model-integrity',
  'model-load-failed',
  'gpu-unavailable',
  'download-failed',
  'storage-insufficient',
  'chrome-unavailable',
  'chrome-not-ready',
  'offscreen-unavailable',
  'ollama-unavailable',
  'ollama-model-missing',
  'ollama-failed',
  'aborted',
  'unknown',
]);

export function isEngineErrorCode(value: unknown): value is EngineErrorCode {
  return typeof value === 'string' && ENGINE_ERROR_CODES.has(value);
}

export function isAbortError(value: unknown): boolean {
  if (value instanceof EngineError) return value.code === 'aborted';
  if (typeof value !== 'object' || value === null) return false;
  const name = 'name' in value && typeof value.name === 'string' ? value.name : '';
  return name === 'AbortError' || name === 'WllamaAbortError';
}

export function abortError(message = engineErrorMessage('aborted')): EngineError {
  return new EngineError('aborted', message);
}

export function toEngineError(value: unknown): EngineError {
  if (isEngineError(value)) return value;
  if (isAbortError(value)) return abortError();
  const message = value instanceof Error ? value.message : String(value);
  return new EngineError('unknown', message, { cause: value });
}
