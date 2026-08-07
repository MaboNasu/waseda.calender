/**
 * pwa-install.js - Service Worker登録 + 「ホーム画面に追加／ブックマーク」の案内
 *
 * 通常訪問時・ログイン直後のいずれも、画面中央のポップアップで案内する
 * （ホーム画面から起動した場合＝スタンドアロン表示中は一切出さない）。
 * 端末によって案内内容を変える:
 *  - スマホ(iOS): 「共有→ホーム画面に追加」の手順を案内（beforeinstallprompt非対応のため）
 *  - スマホ(Android等): beforeinstallprompt イベントを使い、独自UIの「追加する」ボタンで誘導
 *  - PC: ブックマーク（Ctrl+D / ⌘+D）を案内。ブラウザ標準機能のためJSからは実行できず、案内のみ
 * 一度閉じたら14日間は再表示しない（localStorageで管理）。
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

function isMobileDevice() {
  return isIos() || /android/i.test(window.navigator.userAgent);
}

function isMacDesktop() {
  return !isMobileDevice() && /Macintosh/i.test(window.navigator.userAgent);
}

/** モバイルの「追加する」ボタンは、実際にbeforeinstallpromptが取れている時だけ意味を持つ */
function hasInstallAction() {
  return !isIos() && isMobileDevice() && !!deferredInstallEvent;
}

function installPromptIcon() {
  return isMobileDevice() ? '📱' : '🔖';
}

function installPromptMessage() {
  if (isIos()) {
    return 'このサイトをホーム画面に追加できます。共有ボタン（□と↑）→「ホーム画面に追加」を選んでください。';
  }
  if (isMobileDevice()) {
    return 'ホーム画面に追加して、アプリのように使えます。';
  }
  const shortcut = isMacDesktop() ? '「⌘ + D」' : '「Ctrl + D」';
  return `このサイトをブックマークしておくと、次回からすぐアクセスできます。${shortcut}でブックマークに追加できます。`;
}

function canShowInstallPrompt() {
  return !isStandaloneDisplay() && !isDismissed();
}

function runInstallAction() {
  if (deferredInstallEvent) deferredInstallEvent.prompt();
}

/** 画面中央のポップアップ（通常訪問時・ログイン直後の両方で使う） */
function showInstallModal() {
  if (!canShowInstallPrompt() || document.querySelector('.pwa-install-modal-overlay')) return;
  const showAction = hasInstallAction();

  const overlay = document.createElement('div');
  overlay.className = 'pwa-install-modal-overlay';
  overlay.innerHTML = `
    <div class="pwa-install-modal">
      <p class="pwa-install-modal-icon">${installPromptIcon()}</p>
      <p class="pwa-install-modal-text">${installPromptMessage()}</p>
      <div class="pwa-install-modal-actions">
        ${showAction ? '<button type="button" class="btn btn-enjy" id="pwa-install-modal-action-btn">ホーム画面に追加する</button>' : ''}
        <button type="button" class="btn btn-ghost" id="pwa-install-modal-dismiss-btn">${showAction ? '今はしない' : '閉じる'}</button>
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

  // 通常訪問時: 画面中央のポップアップ。
  // iOS・PCはbeforeinstallpromptが飛んでこないためその場ですぐ案内し、
  // Android等は「追加する」ボタンを機能させるためbeforeinstallpromptを待ってから出す。
  if (isIos() || !isMobileDevice()) {
    showInstallModal();
  } else {
    window.addEventListener('beforeinstallprompt', () => showInstallModal());
  }

  // ログイン直後、まだ出ていなければ改めて促す（エンゲージメントが高い瞬間のため）
  window.addEventListener('wc-auth-changed', (e) => {
    const isNowLoggedIn = !!(e.detail && e.detail.user);
    if (isNowLoggedIn && !wasLoggedIn) {
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
