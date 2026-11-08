import type { GlossaryEntry } from '@/engine/types';
import { normalizeGlossary } from './glossary';
import {
  DEFAULT_TARGET_LANGUAGE,
  isTargetLanguage,
  resolveTargetLanguage,
  type TargetLanguage,
} from './languages';
import { isRecord } from './object';

export const SETTINGS_SCHEMA_VERSION = 1;

/** Date the bundled PLaMo Community License text was copied into this repository. */
export const PLAMO_LICENSE_VERSION = '2026-11-05';

/**
 * Version of the consent notice — the explanation shown beside the agree button — not of
 * the license text itself.
 *
 * It is stored in the same record as the license version because the two answer different
 * questions. `PLAMO_LICENSE_VERSION` says which legal text the user agreed to.
 * `PLAMO_NOTICE_VERSION` says which explanation of the terms they read before agreeing. A
 * user who agreed to the older, denser commercial summary has technically accepted the same
 * license, but they have not seen the clearer three-part one, so the record has to be able to
 * say "this agreement predates the clearer notice" without invalidating the license itself.
 */
export const PLAMO_NOTICE_VERSION = '2026-11-06';

export type Formality = 'polite' | 'plain';
export type DisplayMode = 'replace' | 'bilingual';
export type TierPreference = 'auto' | 'g' | 'c8' | 'c4';
export type TranslationPace = 'fast' | 'quality';
export type IdleMinutes = 0 | 1 | 5 | 15;

/**
 * Where the translation model runs. `browser` is the bundled wllama runtime; `ollama`
 * sends the same PFML3 prompt to a local Ollama server, which can hold a larger PLaMo
 * checkpoint and use the machine's GPU directly.
 */
export type EngineSource = 'browser' | 'ollama';

export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';

/**
 * The model card's Ollama example. It is a Hugging Face GGUF pulled with
 * `ollama pull hf.co/pfnet/plamo-3-translate-2b-GGUF:Q4_K_M`, so the default is a model a
 * reader can actually fetch rather than an alias this extension invents.
 */
export const DEFAULT_OLLAMA_MODEL = 'hf.co/pfnet/plamo-3-translate-2b-GGUF:Q4_K_M';

/** Context Ollama is asked for; also the budget the prompt planner uses. */
export const OLLAMA_CONTEXT_TOKENS = 4096;

const MAX_OLLAMA_URL = 300;
const MAX_OLLAMA_MODEL = 200;

export interface LicenseConsent {
  license: 'plamo-community';
  version: typeof PLAMO_LICENSE_VERSION;
  /**
   * Which onboarding notice was on screen when the button was pressed. `legacy` for a record
   * written before this field existed; see `LEGACY_NOTICE_VERSION`.
   */
  notice: string;
  acceptedAt: string;
  /**
   * True when the onboarding click happened with the age notice on screen. It records that
   * the notice was shown, not that a guardian was asked or that the user's age was checked.
   */
  ageNoticeShown: true;
}

export interface Settings {
  schemaVersion: number;
  targetLanguage: TargetLanguage;
  form: Formality;
  display: DisplayMode;
  consent: LicenseConsent | null;
  highQualityDismissed: boolean;
  glossary: GlossaryEntry[];
  idleMinutes: IdleMinutes;
  tier: TierPreference;
  pace: TranslationPace;
  engineSource: EngineSource;
  ollamaUrl: string;
  ollamaModel: string;
}

export type SettingsPatch = Partial<
  Pick<
    Settings,
    | 'targetLanguage'
    | 'form'
    | 'display'
    | 'consent'
    | 'highQualityDismissed'
    | 'glossary'
    | 'idleMinutes'
    | 'tier'
    | 'pace'
    | 'engineSource'
    | 'ollamaUrl'
    | 'ollamaModel'
  >
>;

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  targetLanguage: DEFAULT_TARGET_LANGUAGE,
  form: 'polite',
  display: 'replace',
  consent: null,
  highQualityDismissed: false,
  glossary: [],
  idleMinutes: 5,
  tier: 'auto',
  pace: 'quality',
  engineSource: 'browser',
  ollamaUrl: DEFAULT_OLLAMA_URL,
  ollamaModel: DEFAULT_OLLAMA_MODEL,
});

export function createDefaultSettings(uiLanguage: string): Settings {
  return {
    ...DEFAULT_SETTINGS,
    glossary: [],
    targetLanguage: resolveTargetLanguage(uiLanguage),
  };
}

export function isTranslationPace(value: unknown): value is TranslationPace {
  return value === 'fast' || value === 'quality';
}

export function isEngineSource(value: unknown): value is EngineSource {
  return value === 'browser' || value === 'ollama';
}

export function isTierPreference(value: unknown): value is TierPreference {
  return value === 'auto' || value === 'g' || value === 'c8' || value === 'c4';
}

export function isIdleMinutes(value: unknown): value is IdleMinutes {
  return value === 0 || value === 1 || value === 5 || value === 15;
}

/**
 * Keeps a stored Ollama base URL to an http(s) origin plus an optional path. A value that
 * is not a URL, carries credentials, or uses another scheme falls back to the loopback
 * default rather than leaving a half-valid string for the client to build on.
 */
export function normalizeOllamaUrl(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_OLLAMA_URL;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_OLLAMA_URL) return DEFAULT_OLLAMA_URL;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return DEFAULT_OLLAMA_URL;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return DEFAULT_OLLAMA_URL;
  if (url.username.length > 0 || url.password.length > 0) return DEFAULT_OLLAMA_URL;

  const path = url.pathname.replace(/\/+$/u, '');
  return `${url.origin}${path}`;
}

/** The origin a host permission is requested for, or null for a URL the client cannot use. */
export function ollamaOrigin(value: string): string | null {
  try {
    const url = new URL(normalizeOllamaUrl(value));
    return url.origin;
  } catch {
    return null;
  }
}

export function normalizeOllamaModel(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_OLLAMA_MODEL;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_OLLAMA_MODEL) return DEFAULT_OLLAMA_MODEL;
  if (/[\r\n\t]/u.test(trimmed)) return DEFAULT_OLLAMA_MODEL;
  return trimmed;
}

export function normalizeSettings(value: unknown, uiLanguage: string): Settings {
  const defaults = createDefaultSettings(uiLanguage);
  if (!isRecord(value) || value.schemaVersion !== SETTINGS_SCHEMA_VERSION) return defaults;

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    targetLanguage: isTargetLanguage(value.targetLanguage)
      ? value.targetLanguage
      : defaults.targetLanguage,
    form: value.form === 'plain' ? 'plain' : 'polite',
    display: value.display === 'bilingual' ? 'bilingual' : 'replace',
    consent: normalizeConsent(value.consent),
    highQualityDismissed: value.highQualityDismissed === true,
    glossary: normalizeGlossary(value.glossary),
    idleMinutes: isIdleMinutes(value.idleMinutes) ? value.idleMinutes : defaults.idleMinutes,
    tier: isTierPreference(value.tier) ? value.tier : defaults.tier,
    pace: isTranslationPace(value.pace) ? value.pace : defaults.pace,
    engineSource: isEngineSource(value.engineSource) ? value.engineSource : defaults.engineSource,
    ollamaUrl: normalizeOllamaUrl(value.ollamaUrl),
    ollamaModel: normalizeOllamaModel(value.ollamaModel),
  };
}

function isAcceptedAt(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

/**
 * Reads a stored consent record.
 *
 * Three shapes exist in the wild:
 *
 * 1. `licenses/` text plus the current notice — the record this build writes.
 * 2. The same license with an earlier notice, or with no notice field at all. These are
 *    kept, because the license text really was agreed to and dropping the record would send
 *    every existing user back through onboarding. They are marked with the notice version
 *    they were written under, so the UI can show the clearer explanation once.
 * 3. Records written before the age notice was renamed, which stored `guardian: true` from
 *    the same click. They describe the same license text, so they keep counting; the
 *    rewritten record stores only that the notice was shown, never that a guardian agreed.
 */
function normalizeConsent(value: unknown): LicenseConsent | null {
  if (!isRecord(value)) return null;
  if (value.license !== 'plamo-community') return null;
  if (value.version !== PLAMO_LICENSE_VERSION) return null;
  if (value.ageNoticeShown !== true && value.guardian !== true) return null;
  if (!isAcceptedAt(value.acceptedAt)) return null;
  return {
    license: 'plamo-community',
    version: PLAMO_LICENSE_VERSION,
    notice: isNoticeVersion(value.notice) ? value.notice : LEGACY_NOTICE_VERSION,
    acceptedAt: value.acceptedAt,
    ageNoticeShown: true,
  };
}

/**
 * A user who agreed before the clearer commercial summary has a valid license record but has
 * never seen the new explanation. Showing it once more must not throw away the model file, so
 * this asks for the overlay rather than a fresh download.
 */
export function needsLicenseReconsent(settings: { consent: unknown } | null | undefined): boolean {
  const consent = settings === null || settings === undefined ? null : settings.consent;
  if (!isRecord(consent)) return false;
  return !isNoticeVersion(consent.notice);
}

/** A notice version string this build recognises. */
export function isNoticeVersion(value: unknown): value is typeof PLAMO_NOTICE_VERSION {
  return value === PLAMO_NOTICE_VERSION;
}

/**
 * The notice version assigned to a record that predates the field. It is not a real version
 * and never matches `PLAMO_NOTICE_VERSION`, which is what makes `needsLicenseReconsent` true
 * for those records exactly once.
 */
export const LEGACY_NOTICE_VERSION = 'legacy';
