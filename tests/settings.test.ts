import { describe, expect, it } from 'vitest';
import { MAX_GLOSSARY_ENTRIES } from '@/shared/glossary';
import { displayLanguage, resolveTargetLanguage } from '@/shared/languages';
import {
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OLLAMA_URL,
  DEFAULT_SETTINGS,
  LEGACY_NOTICE_VERSION,
  PLAMO_LICENSE_VERSION,
  PLAMO_NOTICE_VERSION,
  SETTINGS_SCHEMA_VERSION,
  createDefaultSettings,
  needsLicenseReconsent,
  normalizeOllamaModel,
  normalizeOllamaUrl,
  normalizeSettings,
  ollamaOrigin,
  type Settings,
} from '@/shared/settings';

function stored(overrides: Partial<Settings> = {}): Settings {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    targetLanguage: 'en',
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
    ...overrides,
  };
}

describe('settings defaults', () => {
  it('uses the UI language with polite form and replacement display', () => {
    expect(createDefaultSettings('fr-FR')).toEqual(stored({ targetLanguage: 'fr' }));
    expect(DEFAULT_SETTINGS.targetLanguage).toBe('en');
  });

  it('falls back to English when the UI language is not supported', () => {
    expect(createDefaultSettings('cs-CZ').targetLanguage).toBe('en');
    expect(createDefaultSettings('pt-BR').targetLanguage).toBe('en');
    expect(createDefaultSettings('').targetLanguage).toBe('en');
    expect(resolveTargetLanguage('not-a-language')).toBe('en');
  });

  it('maps Chinese UI languages to the supported scripts', () => {
    expect(resolveTargetLanguage('zh-CN')).toBe('zh-hans');
    expect(resolveTargetLanguage('zh-TW')).toBe('zh-hant');
    expect(resolveTargetLanguage('zh-HK')).toBe('zh-hant');
    expect(resolveTargetLanguage('zh-Hant-HK')).toBe('zh-hant');
  });

  it('falls back to the raw tag when a page language cannot be displayed', () => {
    expect(displayLanguage('en', 'ja')).toBe('英語');
    expect(displayLanguage('not-a-language', 'en')).toBe('not-a-language');
    expect(displayLanguage('', 'en')).toBe('');
  });

  it('keeps valid stored values and repairs invalid ones', () => {
    expect(
      normalizeSettings(
        {
          schemaVersion: SETTINGS_SCHEMA_VERSION,
          targetLanguage: 'ko',
          form: 'plain',
          display: 'bilingual',
        },
        'en-US',
      ),
    ).toEqual(
      stored({
        targetLanguage: 'ko',
        form: 'plain',
        display: 'bilingual',
      }),
    );

    expect(
      normalizeSettings(
        {
          schemaVersion: SETTINGS_SCHEMA_VERSION,
          targetLanguage: 'xx',
          form: 'verbose',
          display: 'side-by-side',
        },
        'en-US',
      ),
    ).toEqual(stored());
  });

  it('ignores stored values written by another schema version', () => {
    expect(
      normalizeSettings(
        {
          schemaVersion: SETTINGS_SCHEMA_VERSION + 1,
          targetLanguage: 'ko',
          form: 'plain',
          display: 'bilingual',
        },
        'ja-JP',
      ),
    ).toEqual(createDefaultSettings('ja-JP'));

    expect(normalizeSettings({ targetLanguage: 'ko' }, 'ja-JP').targetLanguage).toBe('ja');
  });

  it('drops consent that does not name the bundled license text', () => {
    expect(
      normalizeSettings(
        {
          schemaVersion: SETTINGS_SCHEMA_VERSION,
          consent: {
            license: 'plamo-community',
            acceptedAt: '2026-11-05T00:00:00.000Z',
            ageNoticeShown: true,
          },
        },
        'ja',
      ).consent,
    ).toBeNull();
  });

  it('keeps a Chrome-only target and a recorded license consent', () => {
    const acceptedAt = '2026-11-05T00:00:00.000Z';
    expect(
      normalizeSettings(
        {
          schemaVersion: SETTINGS_SCHEMA_VERSION,
          targetLanguage: 'pt',
          consent: {
            license: 'plamo-community',
            version: PLAMO_LICENSE_VERSION,
            notice: PLAMO_NOTICE_VERSION,
            acceptedAt,
            ageNoticeShown: true,
          },
          glossary: [{ source: 'Sign in', target: 'ログイン' }],
          idleMinutes: 0,
          tier: 'c4',
          highQualityDismissed: true,
        },
        'en-US',
      ),
    ).toEqual(
      stored({
        targetLanguage: 'pt',
        consent: {
          license: 'plamo-community',
          version: PLAMO_LICENSE_VERSION,
          notice: PLAMO_NOTICE_VERSION,
          acceptedAt,
          ageNoticeShown: true,
        },
        glossary: [{ source: 'Sign in', target: 'ログイン' }],
        idleMinutes: 0,
        tier: 'c4',
        highQualityDismissed: true,
      }),
    );
  });

  it('keeps a 5000-entry glossary when repairing other settings', () => {
    const glossary = Array.from({ length: MAX_GLOSSARY_ENTRIES }, (_, index) => ({
      source: `term-${String(index)}`,
      target: `訳-${String(index)}`,
    }));
    const settings = normalizeSettings(
      {
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        targetLanguage: 'xx',
        glossary,
      },
      'en-US',
    );

    expect(settings.glossary).toEqual(glossary);
    expect(settings.glossary).toHaveLength(MAX_GLOSSARY_ENTRIES);
    expect(settings.targetLanguage).toBe('en');
  });

  it('keeps consent written before the age notice was renamed', () => {
    const acceptedAt = '2026-11-05T00:00:00.000Z';
    const consent = normalizeSettings(
      {
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        consent: {
          license: 'plamo-community',
          version: PLAMO_LICENSE_VERSION,
          acceptedAt,
          guardian: true,
        },
      },
      'ja',
    ).consent;

    expect(consent).toEqual({
      license: 'plamo-community',
      version: PLAMO_LICENSE_VERSION,
      notice: LEGACY_NOTICE_VERSION,
      acceptedAt,
      ageNoticeShown: true,
    });
    expect(consent).not.toHaveProperty('guardian');
    // A legacy record still counts as consent to the same license text.
    expect(needsLicenseReconsent({ consent })).toBe(true);
  });

  it('does not treat a false guardian flag as a recorded consent', () => {
    expect(
      normalizeSettings(
        {
          schemaVersion: SETTINGS_SCHEMA_VERSION,
          consent: {
            license: 'plamo-community',
            version: PLAMO_LICENSE_VERSION,
            acceptedAt: '2026-11-05T00:00:00.000Z',
            guardian: false,
          },
        },
        'ja',
      ).consent,
    ).toBeNull();
  });
});

describe('Ollama settings', () => {
  it('defaults to the in-browser engine and the model card example', () => {
    expect(DEFAULT_SETTINGS.engineSource).toBe('browser');
    expect(DEFAULT_SETTINGS.ollamaUrl).toBe('http://127.0.0.1:11434');
    expect(DEFAULT_SETTINGS.ollamaModel).toBe(
      'hf.co/pfnet/plamo-3-translate-2b-GGUF:Q4_K_M',
    );
  });

  it('keeps an Ollama choice and its endpoint across a reload', () => {
    const settings = normalizeSettings(
      {
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        engineSource: 'ollama',
        ollamaUrl: 'http://192.168.1.20:11434/',
        ollamaModel: 'plamo-3-translate:8b',
      },
      'ja',
    );

    expect(settings.engineSource).toBe('ollama');
    expect(settings.ollamaUrl).toBe('http://192.168.1.20:11434');
    expect(settings.ollamaModel).toBe('plamo-3-translate:8b');
  });

  it('repairs an endpoint that is not a plain http(s) URL', () => {
    for (const value of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'http://user:secret@127.0.0.1:11434',
      'not a url',
      '',
      'x'.repeat(400),
    ]) {
      expect(normalizeOllamaUrl(value), value).toBe(DEFAULT_OLLAMA_URL);
    }
    expect(normalizeOllamaUrl(undefined)).toBe(DEFAULT_OLLAMA_URL);
  });

  it('keeps a path prefix on a reverse-proxied endpoint', () => {
    expect(normalizeOllamaUrl('https://gpu.example/ollama/')).toBe('https://gpu.example/ollama');
    expect(ollamaOrigin('https://gpu.example/ollama/')).toBe('https://gpu.example');
    expect(ollamaOrigin('not a url')).toBe('http://127.0.0.1:11434');
  });

  it('repairs an empty or multi-line model name', () => {
    expect(normalizeOllamaModel('  plamo-3-translate:8b  ')).toBe('plamo-3-translate:8b');
    expect(normalizeOllamaModel('')).toBe(DEFAULT_OLLAMA_MODEL);
    expect(normalizeOllamaModel('a\nb')).toBe(DEFAULT_OLLAMA_MODEL);
    expect(normalizeOllamaModel(42)).toBe(DEFAULT_OLLAMA_MODEL);
  });

  it('falls back to the browser engine for an unknown source', () => {
    expect(
      normalizeSettings(
        { schemaVersion: SETTINGS_SCHEMA_VERSION, engineSource: 'cloud' },
        'en',
      ).engineSource,
    ).toBe('browser');
  });
});

describe('license notice re-consent', () => {
  const acceptedAt = '2026-11-05T00:00:00.000Z';

  function consentWith(extra: Record<string, unknown>): Settings {
    return normalizeSettings(
      {
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        consent: {
          license: 'plamo-community',
          version: PLAMO_LICENSE_VERSION,
          acceptedAt,
          ageNoticeShown: true,
          ...extra,
        },
      },
      'ja',
    );
  }

  it('asks nothing of a user who already agreed under the current notice', () => {
    const settings = consentWith({ notice: PLAMO_NOTICE_VERSION });
    expect(settings.consent?.notice).toBe(PLAMO_NOTICE_VERSION);
    expect(needsLicenseReconsent(settings)).toBe(false);
  });

  /**
   * The earlier build's four-bullet commercial summary was accurate but hard to read, and
   * users who agreed to it never saw the clearer three-part version. Their consent still
   * names the same bundled license text, so it stays valid, and the notice version is what
   * tells the UI to show the new explanation once without discarding the stored model.
   */
  it('asks a user who agreed under an earlier notice to see the new one', () => {
    const settings = consentWith({});
    expect(settings.consent).not.toBeNull();
    expect(settings.consent?.notice).toBe(LEGACY_NOTICE_VERSION);
    expect(needsLicenseReconsent(settings)).toBe(true);
  });

  it('does not ask before any consent exists', () => {
    expect(needsLicenseReconsent(null)).toBe(false);
    expect(needsLicenseReconsent(undefined)).toBe(false);
    expect(needsLicenseReconsent(consentWith({ license: 'other' }))).toBe(false);
  });

  it('keeps the recorded timestamp and never claims a guardian agreed', () => {
    const settings = consentWith({ notice: PLAMO_NOTICE_VERSION });
    expect(settings.consent?.acceptedAt).toBe(acceptedAt);
    expect(settings.consent?.ageNoticeShown).toBe(true);
    expect(settings.consent).not.toHaveProperty('guardian');
  });
});
