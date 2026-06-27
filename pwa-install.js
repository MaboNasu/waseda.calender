/**
 * pwa-install.js - Service Worker登録 + 「ホーム画面に追加」の案内
 *
 * 2つの出し方がある:
 *  - 通常訪問時（未ログイン含む）: 画面下部の控えめなバナー
 *  - ログイン直後: 画面中央のモーダル（エンゲージメントが高い瞬間なので強めに誘導する）
 * いずれも一度閉じたら14日間は再表示しない（localStorageで管理、両者で共有）。
 *
 * Chrome/Android: beforeinstallprompt イベントを使い、独自デザインのUIから誘導する。
 * iOS Safari: beforeinstallprompt 非対応のため、「共有→ホーム画面に追加」の手順を案内する。
 */
const PWA_DISMISS_KEY = 'wc-pwa-install-dismissed-until';
const PWA_DISMISS_DAYS = 14;

let deferredInstallEvent = null;
let wasLoggedIn = false;

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
  } catch (e) {
    // localStorageが使えない環境では何もしない
  }
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function installPromptMessage() {
  return isIos()
    ? 'このサイトをホーム画面に追加できます。共有ボタン（□と↑）→「ホーム画面に追加」を選んでください。'
    : 'ホーム画面に追加して、アプリのように使えます。';
}

function canShowInstallPrompt() {
  if (isStandaloneDisplay() || isDismissed()) return false;
  return isIos() || !!deferredInstallEvent;
}

function runInstallAction() {
  if (deferredInstallEvent) deferredInstallEvent.prompt();
}

/** 画面下部の控えめなバナー（通常訪問時） */
function showInstallBanner() {
  if (!canShowInstallPrompt() || document.querySelector('.pwa-install-banner')) return;

  const banner = document.createElement('div');
  banner.className = 'pwa-install-banner';
  banner.innerHTML = `
    <span class="pwa-install-text">${installPromptMessage()}</span>
    <div class="pwa-install-actions">
      ${isIos() ? '' : '<button type="button" class="btn btn-enjy btn-sm" id="pwa-install-action-btn">追加する</button>'}
      <button type="button" class="btn btn-ghost btn-sm" id="pwa-install-dismiss-btn">閉じる</button>
    </div>`;
  document.body.appendChild(banner);

  const dismissBtn = document.getElementById('pwa-install-dismiss-btn');
  if (dismissBtn) dismissBtn.addEventListener('click', () => { dismissForNow(); banner.remove(); });

  const actionBtn = document.getElementById('pwa-install-action-btn');
  if (actionBtn) actionBtn.addEventListener('click', () => { runInstallAction(); banner.remove(); });
}

/** 画面中央のモーダル（ログイン直後） */
function showInstallModal() {
  if (!canShowInstallPrompt() || document.querySelector('.pwa-install-modal-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'pwa-install-modal-overlay';
  overlay.innerHTML = `
    <div class="pwa-install-modal">
      <p class="pwa-install-modal-icon">📱</p>
      <p class="pwa-install-modal-text">${installPromptMessage()}</p>
      <div class="pwa-install-modal-actions">
        ${isIos() ? '' : '<button type="button" class="btn btn-enjy" id="pwa-install-modal-action-btn">ホーム画面に追加する</button>'}
        <button type="button" class="btn btn-ghost" id="pwa-install-modal-dismiss-btn">今はしない</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => { dismissForNow(); overlay.remove(); };
  document.getElementById('pwa-install-modal-dismiss-btn')?.addEventListener('click', close);
  const actionBtn = document.getElementById('pwa-install-modal-action-btn');
  if (actionBtn) actionBtn.addEventListener('click', () => { runInstallAction(); overlay.remove(); dismissForNow(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallEvent = event;
  });

  // 通常訪問時は下部バナー（iOSはイベントを待たずに案内のみ出せる）
  if (isIos()) {
    showInstallBanner();
  } else {
    window.addEventListener('beforeinstallprompt', () => showInstallBanner());
  }

  // ログイン直後だけ中央モーダル（「未ログイン→ログイン済み」に変わった瞬間のみ）
  window.addEventListener('wc-auth-changed', (e) => {
    const isNowLoggedIn = !!(e.detail && e.detail.user);
    if (isNowLoggedIn && !wasLoggedIn) {
      document.querySelectorAll('.pwa-install-banner').forEach(b => b.remove());
      showInstallModal();
    }
    wasLoggedIn = isNowLoggedIn;
  });
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
