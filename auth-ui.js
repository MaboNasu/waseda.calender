/**
 * auth-ui.js - 全ページ共通のヘッダーログインUI
 *
 * firebase-init.js（type="module"）が window.WC.auth / 'wc-auth-changed' イベントを
 * 用意するのを待って、#header-auth にログイン/ログアウトボタンを描画する。
 */
function authUiEscapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** ログアウト直後に1回だけ「ログアウトしました」を表示するためのフラグ */
let pendingLogoutToast = false;

/** ログイン処理の二重クリック防止（signInWithGoogleの呼び出しが多重に走らないようにする） */
let loginInProgress = false;

/** Firebase Authenticationのエラーコード→日本語メッセージ */
function translateAuthError(err) {
  const code = err && err.code;
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return ''; // 利用者が自分でポップアップを閉じた/連打しただけなので、エラー表示はしない
    case 'auth/network-request-failed':
      return '通信エラーが発生しました。ネットワーク環境をご確認のうえ、再度お試しください。';
    case 'auth/user-disabled':
      return 'このアカウントは現在ご利用いただけません。';
    case 'auth/too-many-requests':
      return '試行回数が多すぎます。時間をおいて再度お試しください。';
    default:
      return 'ログインに失敗しました。時間をおいて再度お試しください。';
  }
}

function renderHeaderAuthError(message) {
  const el = document.getElementById('header-auth');
  if (!el || !message) return;
  const errEl = document.createElement('span');
  errEl.className = 'header-auth-error';
  errEl.textContent = message;
  el.appendChild(errEl);
  setTimeout(() => errEl.remove(), 4000);
}

function renderHeaderAuthLoading() {
  const el = document.getElementById('header-auth');
  if (!el) return;
  el.innerHTML = `<span class="header-auth-loading" aria-live="polite">確認中…</span>`;
}

async function handleLoginClick(btn) {
  if (loginInProgress) return;
  loginInProgress = true;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'ログイン中…';
  try {
    await window.WC.auth.signInWithGoogle();
    // ポップアップ成功時はonAuthStateChanged経由でrenderHeaderAuthが呼ばれて描画が更新される。
    // リダイレクト方式に切り替わった場合はページ遷移するため、ここには戻ってこない。
  } catch (err) {
    const message = translateAuthError(err);
    btn.disabled = false;
    btn.textContent = originalText;
    if (message) renderHeaderAuthError(message);
  } finally {
    loginInProgress = false;
  }
}

function renderHeaderAuth(user) {
  const el = document.getElementById('header-auth');
  if (!el) return;

  if (!user) {
    if (pendingLogoutToast) {
      pendingLogoutToast = false;
      el.innerHTML = `<span class="header-auth-toast">ログアウトしました</span>`;
      setTimeout(() => renderHeaderAuth(null), 1500);
      return;
    }
    el.innerHTML = `<button type="button" class="btn btn-ghost btn-sm header-login-btn" id="header-login-btn">Googleでログイン</button>`;
    const btn = document.getElementById('header-login-btn');
    if (btn) btn.addEventListener('click', () => handleLoginClick(btn));
    return;
  }

  const name = authUiEscapeHtml(user.displayName || user.email || 'ログイン中');
  const photo = user.photoURL ? `<img src="${authUiEscapeHtml(user.photoURL)}" alt="" class="header-auth-avatar">` : '';
  el.innerHTML = `
    <div class="header-auth-user">
      ${photo}
      <span class="header-auth-name">${name}</span>
      <button type="button" class="btn btn-ghost btn-sm" id="header-logout-btn">ログアウト</button>
    </div>`;
  const logoutBtn = document.getElementById('header-logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    if (logoutBtn.disabled) return;
    if (!confirm('ログアウトしますか？')) return;
    logoutBtn.disabled = true;
    pendingLogoutToast = true;
    window.WC.auth.signOutUser().catch(() => {
      pendingLogoutToast = false;
      logoutBtn.disabled = false;
      renderHeaderAuthError('ログアウトに失敗しました。時間をおいて再度お試しください。');
    });
  });
}

window.addEventListener('wc-auth-changed', (e) => {
  renderHeaderAuth(e.detail.user);
});

// リダイレクト方式ログインでの失敗（ポップアップと違いtry/catchで拾えない）をここで表示する
window.addEventListener('wc-auth-error', (e) => {
  const message = translateAuthError(e.detail.error);
  renderHeaderAuth(null);
  if (message) renderHeaderAuthError(message);
});

document.addEventListener('DOMContentLoaded', () => {
  if (window.WC && window.WC.firebaseReady) {
    renderHeaderAuth(window.WC.currentUser || null);
  } else {
    renderHeaderAuthLoading();
  }
});
