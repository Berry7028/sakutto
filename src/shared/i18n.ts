import enMessages from '../../public/_locales/en/messages.json';
import jaMessages from '../../public/_locales/ja/messages.json';

/**
 * The extension's own interface is Japanese only, whatever the browser's language is set to.
 * The English catalogue stays as the key set (`MessageKey`) and as a fallback for a key that
 * the Japanese catalogue is missing.
 */
export type MessageKey = keyof typeof enMessages;

export type UiLocale = 'ja' | 'en';

/** The locale every message is shown in. */
const UI_LOCALE: UiLocale = 'ja';

interface MessageEntry {
  message: string;
  description?: string;
  placeholders?: Record<string, { content: string }>;
}

type MessageCatalog = Record<string, MessageEntry>;

const CATALOGS: Readonly<Record<UiLocale, MessageCatalog>> = {
  ja: jaMessages as MessageCatalog,
  en: enMessages as MessageCatalog,
};

/** U+0024 DOLLAR SIGN, written as a code point so no regex or anchor can read it as one. */
const DOLLAR_CODE = 0x24;
const DOLLAR = String.fromCharCode(DOLLAR_CODE);

/** The `$NAME$` token a `placeholders` entry declares. */
function placeholderToken(name: string): string {
  return `${DOLLAR}${name.toUpperCase()}${DOLLAR}`;
}

/**
 * The substitution a `placeholders` entry names: `$1` is the first one, `$2` the second.
 *
 * The content is read as characters rather than matched with a pattern, because a `$` in a
 * pattern is an anchor unless it is escaped, and the digits are what the value is made of.
 */
function placeholderIndex(content: string): number | null {
  const chars = [...content.trim()];
  if (chars.length < 2) return null;
  if (chars[0]?.charCodeAt(0) !== DOLLAR_CODE) return null;
  const index = Number(chars.slice(1).join(''));
  if (!Number.isInteger(index) || index < 1) return null;
  return index;
}

/**
 * Fills the `$NAME$` tokens Chrome would interpolate. The JSON is read directly here, so
 * the placeholders are not expanded for us: each declared placeholder takes the
 * substitution its `content` names (`$1` is the first substitution), in declaration order.
 * The `$1$` form is replaced too, for an entry that declares nothing.
 */
function formatMessage(entry: MessageEntry, values: readonly string[]): string {
  let text = entry.message;

  for (const [name, placeholder] of Object.entries(entry.placeholders ?? {})) {
    const index = placeholderIndex(placeholder.content);
    if (index === null) continue;
    const value = values[index - 1] ?? '';
    text = text.replaceAll(placeholderToken(name), value);
  }

  // An entry that declares nothing may still use the positional `$1$` form.
  for (const [position, value] of values.entries()) {
    text = text.replaceAll(`${DOLLAR}${String(position + 1)}${DOLLAR}`, value);
  }

  return text;
}

function lookup(locale: UiLocale, key: MessageKey): MessageEntry | undefined {
  return CATALOGS[locale][key];
}

/**
 * A UI string. The Japanese catalogue is read first, then English, then the key itself, so a
 * missing translation shows something rather than throwing inside a render.
 */
export function t(key: MessageKey, substitutions?: string | string[]): string {
  const entry = lookup(UI_LOCALE, key) ?? lookup('en', key);
  if (!entry) return key;

  if (substitutions === undefined) return entry.message;
  const values = (Array.isArray(substitutions) ? substitutions : [substitutions]).map((value) =>
    String(value),
  );
  return formatMessage(entry, values);
}

/**
 * The language the interface is written in. Not the browser's UI language: the pages and the
 * engine both use this to pick a locale for names and for `document.documentElement.lang`.
 */
export function currentUiLanguage(): string {
  return UI_LOCALE;
}

export function uiLocale(): UiLocale {
  return UI_LOCALE;
}
