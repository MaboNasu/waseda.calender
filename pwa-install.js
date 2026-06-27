/**
 * pwa-install.js - Service Worker登録 + 「ホーム画面に追加」バナー
 *
 * Chrome/Android: beforeinstallprompt イベントを使い、独自デザインのバナーから誘導する。
 * iOS Safari: beforeinstallprompt 非対応のため、「共有→ホーム画面に追加」の手順を案内するバナーを出す。
 * いずれも一度閉じたら14日間は再表示しない（localStorageで管理）。
 */
const PWA_DISMISS_KEY = 'wc-pwa-install-dismissed-until';
const PWA_DISMISS_DAYS = 14;

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

function createBanner(message, actionLabel, onAction) {
  const banner = document.createElement('div');
  banner.className = 'pwa-install-banner';
  banner.innerHTML = `
    <span class="pwa-install-text">${message}</span>
    <div class="pwa-install-actions">
      ${actionLabel ? `<button type="button" class="btn btn-enjy btn-sm" id="pwa-install-action-btn">${actionLabel}</button>` : ''}
      <button type="button" class="btn btn-ghost btn-sm" id="pwa-install-dismiss-btn">閉じる</button>
    </div>`;
  document.body.appendChild(banner);

  const dismissBtn = document.getElementById('pwa-install-dismiss-btn');
  if (dismissBtn) dismissBtn.addEventListener('click', () => {
    dismissForNow();
    banner.remove();
  });

  const actionBtn = document.getElementById('pwa-install-action-btn');
  if (actionBtn && onAction) actionBtn.addEventListener('click', () => {
    onAction();
    banner.remove();
  });

  return banner;
}

function setupInstallPrompt() {
  if (isStandaloneDisplay() || isDismissed()) return;

  if (isIos()) {
    // iOSはプログラムからの誘導ができないため、手順を案内するのみ
    createBanner('このサイトをホーム画面に追加できます。共有ボタン（□と↑）→「ホーム画面に追加」を選んでください。', '', null);
    return;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    if (isDismissed()) return;
    createBanner('ホーム画面に追加して、アプリのように使えます。', '追加する', () => {
      event.prompt();
    });
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
