import type { EngineStatus } from '@/shared/engine-status';
import type { MessageKey } from '@/shared/i18n';
import { isChromeOnlyLanguage } from '@/shared/languages';
import { formatByteSize } from './format';

export interface RuntimeLabel {
  key: MessageKey;
  substitutions?: string[];
}

export function runtimeLabel(input: {
  status: EngineStatus | null;
  pageSimple: boolean;
  targetLanguage: string;
}): RuntimeLabel {
  const { status, pageSimple, targetLanguage } = input;
  if (!status) return { key: 'runtimeChecking' };

  const state = status.model.state;
  if (state === 'downloading') {
    const percent = String(Math.max(0, Math.min(100, Math.round(status.model.progress * 100))));
    return {
      key: 'runtimeDownloading',
      substitutions: [
        percent,
        formatByteSize(status.model.received),
        formatByteSize(status.model.total),
      ],
    };
  }
  if (state === 'verifying') return { key: 'runtimeVerifying' };
  if (state === 'loading') return { key: 'runtimeLoading' };

  // Only a pair the model cannot translate at all is handled by Chrome, and that engine
  // is the page's real translator rather than a stand-in for a warming model.
  if (isChromeOnlyLanguage(targetLanguage) || pageSimple) return { key: 'runtimeChrome' };

  // The reader chose the local server, so its state is the answer even when the in-browser
  // model happens to be loaded as well.
  if (status.ollama?.enabled === true) {
    switch (status.ollama.state) {
      case 'ready':
        return { key: 'runtimeOllama', substitutions: [status.ollama.model] };
      case 'model-missing':
        return { key: 'runtimeOllamaModelMissing' };
      case 'unreachable':
        return { key: 'runtimeOllamaUnreachable' };
      case 'disabled':
        break;
      default:
        return { key: 'runtimeOllamaUnknown' };
    }
  }

  if (status.plamoReady) {
    if (status.backend === 'webgpu') return { key: 'runtimePlamoGpu' };
    return { key: status.gpuFallback === true ? 'runtimePlamoGpuFallback' : 'runtimePlamoCpu' };
  }

  if (state === 'error') return { key: 'runtimeError' };
  return { key: 'runtimeWaiting' };
}
