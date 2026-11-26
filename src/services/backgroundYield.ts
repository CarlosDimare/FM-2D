/**
 * backgroundYield.ts
 * Cooperative main-thread yield utility that keeps running at full speed
 * even when the browser tab is hidden or minimized (`document.visibilityState === 'hidden'`).
 *
 * Why:
 *  - `requestAnimationFrame` stops firing completely in background tabs.
 *  - Window `setTimeout(fn, 0)` gets throttled by browsers to >= 1000ms in background tabs.
 *  - A dedicated Web Worker's `setTimeout(fn, 1)` + `postMessage` bypasses tab throttling,
 *    while `MessageChannel` / `requestAnimationFrame` keeps foreground UI painting smoothly.
 */

let bgWorker: Worker | null = null;
let bgWorkerDisabled = false;
let nextTickId = 1;
const pendingCallbacks = new Map<number, () => void>();
let originalDocumentTitle: string | null = null;

function ensureBackgroundWorker(): Worker | null {
  if (bgWorkerDisabled || typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (bgWorker) return bgWorker;
  try {
    const workerSource = `
      self.onmessage = function(e) {
        var id = e.data;
        setTimeout(function() { self.postMessage(id); }, 1);
      };
    `;
    const blob = new Blob([workerSource], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = (e: MessageEvent<number>) => {
      const cb = pendingCallbacks.get(e.data);
      if (cb) {
        pendingCallbacks.delete(e.data);
        cb();
      }
    };
    worker.onerror = () => {
      bgWorkerDisabled = true;
      bgWorker = null;
      const cbs = Array.from(pendingCallbacks.values());
      pendingCallbacks.clear();
      cbs.forEach((cb) => cb());
    };
    bgWorker = worker;
    return bgWorker;
  } catch {
    bgWorkerDisabled = true;
    return null;
  }
}

function yieldViaMessageChannel(): Promise<void> {
  if (typeof MessageChannel !== 'undefined') {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        resolve();
      };
      channel.port2.postMessage(undefined);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function yieldViaWorker(): Promise<void> {
  const worker = ensureBackgroundWorker();
  if (!worker) return yieldViaMessageChannel();
  return new Promise((resolve) => {
    const id = nextTickId++;
    const safety = setTimeout(() => {
      if (pendingCallbacks.delete(id)) resolve();
    }, 250);
    pendingCallbacks.set(id, () => {
      clearTimeout(safety);
      resolve();
    });
    worker.postMessage(id);
  });
}

export function isTabHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * Yields control briefly so React can commit state updates and browser can paint
 * (when visible) OR continues promptly without 1s throttling (when hidden).
 */
export async function yieldToMain(mode: 'paint' | 'background' = 'paint'): Promise<void> {
  if (isTabHidden() || mode === 'background') {
    await yieldViaWorker();
    return;
  }

  // Foreground: let browser commit a frame if needed without ever stalling if rAF is delayed
  if (typeof requestAnimationFrame === 'function') {
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const fallback = setTimeout(done, 34);
      requestAnimationFrame(() => {
        clearTimeout(fallback);
        setTimeout(done, 0);
      });
    });
    return;
  }

  await yieldViaMessageChannel();
}

export function setSimulationTabTitle(progressPct: number, label = 'Simulando Vacaciones'): void {
  if (typeof document === 'undefined') return;
  if (originalDocumentTitle === null) {
    originalDocumentTitle = document.title || 'Football Manager';
  }
  const pct = Math.max(0, Math.min(100, Math.round(progressPct)));
  document.title = `⏳ ${pct}% · ${label}`;
}

export function restoreTabTitle(): void {
  if (typeof document === 'undefined' || originalDocumentTitle === null) return;
  document.title = originalDocumentTitle;
  originalDocumentTitle = null;
}
