/**
 * pwa-install.js - Service Worker登録 + 「ホーム画面に追加／ブックマーク」の案内
 *
 * UX方針:
 * - 初回訪問では絶対に中央ポップアップを出さない。
 * - 2回目以降の訪問、またはログイン/保存など明確なエンゲージメント後にのみ案内する。
 * - 404 / 規約 / 問い合わせ等、再訪訴求が不自然なページでは出さない。
 * - dialog semantics / Esc / focus trap / 元フォーカス復帰に対応する。
 */
const PWA_DISMISS_KEY = 'wc-pwa-install-dismissed-until';
const PWA_DISMISS_DAYS = 30;
const PWA_VISIT_COUNT_KEY = 'wc-pwa-visit-count';
const PWA_VISIT_SESSION_KEY = 'wc-pwa-visit-counted-session';

let deferredInstallEvent = null;
let installModalTrigger = null;

function isStandaloneDisplay() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isDismissed() {
  try {
    const until = Number(localStorage.getItem(PWA_DISMISS_KEY) || 0);
    return Date.now() < until;
  } catch (e) {
    return false;
  }
}

function dismissForNow() {
  try {
    const until = Date.now() + PWA_DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(PWA_DISMISS_KEY, String(until));
  } catch (e) {}
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isMobileDevice() {
  return isIos() || /android/i.test(window.navigator.userAgent);
}

function isMacDesktop() {
  return !isMobileDevice() && /Macintosh/i.test(window.navigator.userAgent);
}

function hasInstallAction() {
  return !isIos() && isMobileDevice() && !!deferredInstallEvent;
}

function installPromptIcon() {
  return isMobileDevice() ? '📱' : '🔖';
}

function installPromptMessage() {
  if (isIos()) {
    return 'また使いたいときは、共有ボタン（□と↑）から「ホーム画面に追加」を選ぶとすぐ開けます。';
  }
  if (isMobileDevice()) {
    return 'Waseda Calendarをホーム画面に追加すると、次回からすぐイベントを探せます。';
  }
  const shortcut = isMacDesktop() ? '⌘ + D' : 'Ctrl + D';
  return `またイベントを探すなら、${shortcut}でブックマークしておくとすぐ戻れます。`;
}

function isPromptEligiblePage() {
  const path = location.pathname;
  if (/\/(404|terms|privacy|about|contact|status)\.html$/.test(path)) return false;
  return path === '/' || path.endsWith('/index.html') || /\/event\//.test(path) || /\/org\//.test(path) || path.endsWith('/mypage.html');
}

function registerVisitAndGetCount() {
  try {
    if (!sessionStorage.getItem(PWA_VISIT_SESSION_KEY)) {
      const next = Number(localStorage.getItem(PWA_VISIT_COUNT_KEY) || 0) + 1;
      localStorage.setItem(PWA_VISIT_COUNT_KEY, String(next));
      sessionStorage.setItem(PWA_VISIT_SESSION_KEY, '1');
      return next;
    }
    return Number(localStorage.getItem(PWA_VISIT_COUNT_KEY) || 1);
  } catch (e) {
    return 1;
  }
}

function canShowInstallPrompt() {
  return isPromptEligiblePage() && !isStandaloneDisplay() && !isDismissed();
}

function runInstallAction() {
  if (deferredInstallEvent) deferredInstallEvent.prompt();
}

function closeInstallModal({ dismiss = true } = {}) {
  const overlay = document.querySelector('.pwa-install-modal-overlay');
  if (!overlay) return;
  if (dismiss) dismissForNow();
  overlay.remove();
  document.removeEventListener('keydown', handleInstallModalKeydown);
  if (installModalTrigger && typeof installModalTrigger.focus === 'function') installModalTrigger.focus();
  installModalTrigger = null;
}

function handleInstallModalKeydown(e) {
  const overlay = document.querySelector('.pwa-install-modal-overlay');
  if (!overlay) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeInstallModal();
    return;
  }
  if (e.key !== 'Tab') return;
  const focusable = [...overlay.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function showInstallModal() {
  if (!canShowInstallPrompt() || document.querySelector('.pwa-install-modal-overlay')) return;
  const showAction = hasInstallAction();
  installModalTrigger = document.activeElement;

  const overlay = document.createElement('div');
  overlay.className = 'pwa-install-modal-overlay';
  overlay.innerHTML = `
    <div class="pwa-install-modal" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title" tabindex="-1">
      <p class="pwa-install-modal-icon" aria-hidden="true">${installPromptIcon()}</p>
      <p class="pwa-install-modal-text" id="pwa-install-title">${installPromptMessage()}</p>
      <div class="pwa-install-modal-actions">
        ${showAction ? '<button type="button" class="btn btn-enjy" id="pwa-install-modal-action-btn">ホーム画面に追加する</button>' : ''}
        <button type="button" class="btn btn-ghost" id="pwa-install-modal-dismiss-btn">${showAction ? '今はしない' : '閉じる'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('pwa-install-modal-dismiss-btn')?.addEventListener('click', () => closeInstallModal());
  document.getElementById('pwa-install-modal-action-btn')?.addEventListener('click', () => {
    runInstallAction();
    closeInstallModal();
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) closeInstallModal(); });
  document.addEventListener('keydown', handleInstallModalKeydown);
  setTimeout(() => overlay.querySelector('button, .pwa-install-modal')?.focus(), 0);
}

function setupInstallPrompt() {
  const visitCount = registerVisitAndGetCount();

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallEvent = event;
    // 2回目以降の訪問だけ。初回はインストール可能でも何も出さない。
    if (visitCount >= 2) setTimeout(showInstallModal, 1400);
  });

  // iOS / PCにはbeforeinstallpromptがないため、2回目以降の訪問で静かに案内する。
  if ((isIos() || !isMobileDevice()) && visitCount >= 2) {
    setTimeout(showInstallModal, 1800);
  }

  // ログインは明確なエンゲージメント。ただしページ描画と同時には出さず少し間を空ける。
  window.addEventListener('wc-auth-changed', e => {
    if (e.detail && e.detail.user) setTimeout(showInstallModal, 2200);
  });

  // 他の機能から「価値体験済み」を通知できる共通フック。
  window.addEventListener('wc-engaged', () => setTimeout(showInstallModal, 1200));
}

function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupServiceWorker();
  setupInstallPrompt();
});
