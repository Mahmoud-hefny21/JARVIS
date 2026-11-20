import { getCurrentWindow } from '@tauri-apps/api/window';
import { command, native } from './bridge';
import { icon } from './icons';

let fullscreen = false;
let changingFullscreen = false;

// Reflow first. Only scale the compact overview when the viewport is too short
// or narrow for its minimum canvas, so no card needs a nested scrollbar.
export function fitOverview() {
  const viewport = document.querySelector<HTMLElement>('.overview-viewport');
  const canvas = viewport?.querySelector<HTMLElement>('.overview-canvas');
  if (!viewport || !canvas || !viewport.clientWidth || !viewport.clientHeight) return;
  const width = viewport.clientWidth, height = viewport.clientHeight;
  const compact = width < 860;
  const short = compact && width >= 520 && height < 360;
  viewport.dataset.layout = short ? 'compact short' : compact ? 'compact' : 'wide';
  const scale = Math.min(1, width / (short ? 520 : compact ? 360 : 860), height / (short ? 260 : compact ? 620 : 560));
  canvas.style.width = `${width / scale}px`;
  canvas.style.height = `${height / scale}px`;
  canvas.style.transform = `scale(${scale})`;
}

async function syncFullscreen() {
  fullscreen = native ? await getCurrentWindow().isFullscreen() : !!document.fullscreenElement;
  document.body.classList.toggle('overview-fullscreen', fullscreen);
  if (fullscreen) document.body.classList.remove('nav-open');
  const button = document.querySelector<HTMLButtonElement>('[data-action="overview-fullscreen"]');
  if (button) {
    const label = fullscreen ? 'Exit overview fullscreen' : 'Enter overview fullscreen';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(fullscreen));
    button.title = fullscreen ? 'Exit fullscreen (Esc)' : 'Overview fullscreen';
    button.innerHTML = icon(fullscreen ? 'collapse' : 'expand');
  }
  fitOverview();
}

export async function toggleOverviewFullscreen(openOverview: () => void, monitorKey?: string) {
  if (changingFullscreen) return;
  changingFullscreen = true;
  try {
    if (!fullscreen) openOverview();
    if (native) {
      const window = getCurrentWindow();
      if (await window.isFullscreen()) await command('monitor_windowed');
      else await command('monitor_fullscreen', monitorKey ? { key: monitorKey } : {});
    } else if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    await syncFullscreen();
  } finally { changingFullscreen = false; }
}

export async function openOverviewFullscreen(openOverview: () => void, monitorKey?: string) {
  if (changingFullscreen) return;
  changingFullscreen = true;
  try {
    openOverview();
    if (native) await command('monitor_fullscreen', monitorKey ? { key: monitorKey } : {});
    else if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    await syncFullscreen();
  } finally { changingFullscreen = false; }
}

export function initializeOverview(openOverview: () => void, onError: (message: string) => void) {
  const report = (error: unknown) => onError(error instanceof Error ? error.message : String(error));
  new ResizeObserver(fitOverview).observe(document.querySelector('#content')!);
  document.addEventListener('fullscreenchange', () => void syncFullscreen().catch(report));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && fullscreen && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      void toggleOverviewFullscreen(openOverview).catch(report);
    }
  });
  if (native) {
    let resizeTimer: ReturnType<typeof setTimeout>;
    void getCurrentWindow().onResized(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => void syncFullscreen().catch(report), 80);
    }).catch(report);
  }
  void syncFullscreen().catch(report);
}
