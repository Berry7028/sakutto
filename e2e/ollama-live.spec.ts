import { expect, test } from '@playwright/test';
import { loadExtension } from './extension';
import { FIXTURE_ORIGIN, commandPage, waitTranslated } from './page';

const MODEL = 'hf.co/pfnet/plamo-3-translate-2b-GGUF:Q4_K_M';

const SETTINGS = {
  schemaVersion: 1,
  targetLanguage: 'ja',
  form: 'polite',
  display: 'replace',
  consent: {
    license: 'plamo-community',
    version: '2026-11-05',
    notice: '2026-11-06',
    acceptedAt: '2026-11-07T00:00:00.000Z',
    ageNoticeShown: true,
  },
  highQualityDismissed: false,
  glossary: [],
  idleMinutes: 5,
  tier: 'auto',
  engineSource: 'ollama',
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: MODEL,
};

test('probes and translates through Ollama', async () => {
  test.skip(
    process.env.SAKUTTO_E2E_OLLAMA !== '1',
    'Set SAKUTTO_E2E_OLLAMA=1 with Ollama running to run this test.',
  );

  const extension = await loadExtension('en-US');
  try {
    await extension.worker.evaluate(async (settings) => {
      const chrome = (
        globalThis as unknown as {
          chrome: {
            storage: {
              local: {
                get(key: string): Promise<Record<string, unknown>>;
                set(v: unknown): Promise<void>;
              };
            };
          };
        }
      ).chrome;
      for (let index = 0; index < 50; index += 1) {
        const stored = await chrome.storage.local.get('settings');
        if (stored.settings !== undefined) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await chrome.storage.local.set({ siteRules: {}, settings });
    }, SETTINGS);

    const options = await extension.context.newPage();
    await options.goto(`chrome-extension://${extension.extensionId}/options.html`);
    // The interface is Japanese on every browser, so the options page a reader sees beside
    // a live Ollama is the Japanese one.
    await expect(options.locator('h1')).toHaveText('Sakutto - ローカルAI翻訳');
    await expect(options.getByRole('heading', { name: 'ローカル Ollama' })).toBeVisible();

    const status = await options.evaluate(async () => {
      const chrome = (
        globalThis as unknown as {
          chrome: { runtime: { sendMessage(message: unknown): Promise<unknown> } };
        }
      ).chrome;
      return chrome.runtime.sendMessage({ type: 'ollama:probe' });
    });
    expect(status).toMatchObject({ enabled: true, model: MODEL, state: 'ready' });
    await options.close();

    const page = await extension.context.newPage();
    await page.goto(`${FIXTURE_ORIGIN}/article.html`);
    await commandPage(extension.worker, page, 'toggle');
    await waitTranslated(page);
    await expect(page.locator('#lead')).toHaveAttribute('data-sakutto-engine', 'ollama');
    // The bar names the engine in Japanese too.
    await expect(page.locator('sakutto-bar')).toHaveAttribute('aria-label', '翻訳の進み具合');
    await page.close();
  } finally {
    await extension.close();
  }
});
