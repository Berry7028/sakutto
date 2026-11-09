import { mount, type Component } from 'svelte';
import { t, uiLocale, type MessageKey } from '@/shared/i18n';
import '@/ui/tokens.css';
import '@/ui/base.css';

export interface MountOptions {
  /**
   * Tab title for this page. The browser shows it on the tab, so each page names itself
   * rather than repeating the extension name. The UI is always Japanese, so the title is
   * taken from the same `t()` the page uses.
   */
  titleKey?: MessageKey;
}

export function mountPage(app: Component, options: MountOptions = {}): void {
  document.documentElement.lang = uiLocale();
  document.title = t(options.titleKey ?? 'extensionName');

  const target = document.getElementById('app');
  if (!target) throw new Error('App root element is missing.');

  mount(app, { target });
}
