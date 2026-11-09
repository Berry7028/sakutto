import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { currentUiLanguage, t, uiLocale, type MessageKey } from '@/shared/i18n';

interface MessageEntry {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

function readMessages(locale: 'ja' | 'en'): Record<string, MessageEntry> {
  const url = new URL(`../public/_locales/${locale}/messages.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as Record<string, MessageEntry>;
}

const ja = readMessages('ja');
const en = readMessages('en');

/** The catalogue keys, as the UI calls them. */
const KEYS = Object.keys(en) as MessageKey[];

/**
 * The `$NAME$` tokens a message interpolates, lowercased. Chrome writes them in upper case;
 * the catalogue declares them in lower case.
 */
function tokensIn(message: string): string[] {
  return [...message.matchAll(/\$([A-Za-z0-9_]+)\$/g)].map((match) =>
    (match[1] ?? '').toLowerCase(),
  );
}

describe('interface language', () => {
  /**
   * The extension's own interface is Japanese whatever the browser is set to. Nothing in the
   * pages asks the browser for its UI language any more, so these two answer 'ja' on every
   * machine rather than following `chrome.i18n.getUILanguage()`.
   */
  it('always reports Japanese, not the browser language', () => {
    expect(uiLocale()).toBe('ja');
    expect(currentUiLanguage()).toBe('ja');
  });
});

describe('t()', () => {
  it('returns the Japanese text for every catalogue key', () => {
    for (const key of KEYS) {
      const expected = ja[key]?.message;
      expect(expected, `ja is missing ${key}`).toBeDefined();
      expect(t(key), key).toBe(expected);
    }
  });

  /**
   * The English catalogue is still the key set, so a key the Japanese one lost would fall
   * back to English and show an English string in a Japanese UI. That is exactly what this
   * catches: no key may resolve to its English text unless the two are deliberately equal.
   */
  it('never falls back to English for a key the interface uses', () => {
    for (const key of KEYS) {
      const english = en[key]?.message ?? '';
      const japanese = ja[key]?.message;
      if (japanese === undefined) continue;
      if (japanese === english) continue;
      expect(t(key), key).not.toBe(english);
    }
  });

  it('returns the key itself for a key no catalogue defines', () => {
    // The cast stands in for a call site that names a key the catalogues do not have; the
    // render must show something instead of throwing.
    expect(t('noSuchMessageKey' as MessageKey)).toBe('noSuchMessageKey');
  });

  it('leaves a message with no substitutions untouched', () => {
    // Passing nothing must not blank the placeholders either: a caller that forgets the
    // values gets the template, not a message with empty gaps.
    expect(t('pageProgress')).toBe(ja.pageProgress?.message);
    expect(t('pageProgress')).toContain('$DONE$');
  });
});

describe('$NAME$ placeholders', () => {
  /**
   * The JSON is read directly, so Chrome never expands a placeholder for us. Each declared
   * placeholder takes the substitution its `content` names, in declaration order.
   */
  it('expands the placeholders the progress bar shows', () => {
    expect(t('pageProgress', ['3', '10'])).toBe('翻訳中 3 / 10');
    expect(t('pageProgress', ['0', '0'])).toBe('翻訳中 0 / 0');
  });

  it('expands the rate shown beside the progress bar', () => {
    expect(t('pageRate', ['42', '7'])).toBe('42 tok/s · 7 区間/s');
  });

  it('expands the host in the site-access page', () => {
    expect(t('siteGrantBody', ['example.com'])).toBe(
      'example.com を開いたときに、この端末で翻訳します。',
    );
  });

  it('expands all three values of the download line', () => {
    expect(t('runtimeDownloading', ['42', '240 MB', '573 MB'])).toBe(
      'ダウンロード中 42%（240 MB / 573 MB）',
    );
    expect(t('runtimePreparing', ['42'])).toBe('準備中 42%');
  });

  it('accepts a single substitution as a plain string', () => {
    expect(t('pagePartial', '4')).toBe('翻訳できない箇所が 4 件残っています。');
    expect(t('downloadEtaSeconds', '12')).toBe('あと約 12 秒です。');
  });

  it('fills a value that contains a dollar sign literally', () => {
    // A `$` in a substitution is data, not the start of another token.
    expect(t('siteGrantBody', ['a$b$c'])).toBe('a$b$c を開いたときに、この端末で翻訳します。');
  });

  it('leaves no $NAME$ token behind once the values are supplied', () => {
    for (const key of KEYS) {
      const entry = ja[key];
      if (!entry) continue;
      const names = Object.keys(entry.placeholders ?? {});
      if (names.length === 0) continue;
      const values = names.map((_, index) => `v${String(index + 1)}`);
      const rendered = t(key, values);
      expect(tokensIn(rendered), key).toEqual([]);
      for (const value of values) expect(rendered, key).toContain(value);
    }
  });

  it('expands every placeholder the English catalogue declares too', () => {
    // The English catalogue is the key set; a placeholder declared there but not expanded
    // would break the fallback path.
    for (const key of KEYS) {
      const entry = en[key];
      if (!entry) continue;
      const names = Object.keys(entry.placeholders ?? {});
      if (names.length === 0) continue;
      const rendered = t(
        key,
        names.map((_, index) => `v${String(index + 1)}`),
      );
      expect(tokensIn(rendered), key).toEqual([]);
    }
  });
});

describe('page titles', () => {
  /**
   * Each page names itself in the tab through `t()`, so the title is Japanese as well. The
   * popup keeps the short product name.
   */
  it('gives every page a Japanese title', () => {
    expect(t('extensionShortName')).toBe('Sakutto');
    expect(t('pageTitleOptions')).toBe('Sakutto の設定');
    expect(t('pageTitleOnboarding')).toBe('Sakutto のセットアップ');
    expect(t('pageTitleTyped')).toBe('テキストを翻訳');
    expect(t('pageTitleGrant')).toBe('サイトのアクセスを許可');
  });

  it('sets the document language from the interface language', () => {
    // `mountPage` writes `uiLocale()` into `<html lang>`; the content script and the pages
    // both rely on it being the interface language rather than the browser's.
    const mount = readFileSync(new URL('../src/ui/mount.ts', import.meta.url), 'utf8');
    expect(mount).toContain('document.documentElement.lang = uiLocale()');
    expect(uiLocale()).toMatch(/^[a-z]{2}$/u);
  });
});

describe('engine and menu copy', () => {
  it('writes the context menu in Japanese', () => {
    expect(t('contextTranslatePage')).toBe('このページを翻訳');
    expect(t('contextTranslateSelection')).toBe('選択したテキストを翻訳');
  });

  it('writes the page bar and the selection bubble in Japanese', () => {
    expect(t('pageTranslated')).toBe('翻訳しました。');
    expect(t('restoreThisPage')).toBe('原文に戻す');
    expect(t('pageAlwaysOn')).toBe('このサイトは常に翻訳します。');
    expect(t('selectionTitle')).toBe('選択したテキスト');
    expect(t('close')).toBe('閉じる');
  });

  /**
   * The engine's own error copy is Japanese too. The status code keeps its `HTTP 403` shape,
   * because that is what a reader searches for.
   */
  it('keeps the HTTP status code in a Japanese download error', () => {
    expect(t('onboardingHttpError', ['403'])).toBe(
      'モデルのダウンロードに失敗しました（HTTP 403）。もう一度お試しください。',
    );
    expect(t('onboardingHttpError', ['403'])).toContain('HTTP 403');
  });
});
