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
    if (btn) btn.addEventListener('click', () => window.WC.auth.signInWithGoogle().catch(() => {}));
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
    if (!confirm('ログアウトしますか？')) return;
    pendingLogoutToast = true;
    window.WC.auth.signOutUser().catch(() => { pendingLogoutToast = false; });
  });
}

window.addEventListener('wc-auth-changed', (e) => {
  renderHeaderAuth(e.detail.user);
});

document.addEventListener('DOMContentLoaded', () => {
  if (window.WC && window.WC.firebaseReady) {
    renderHeaderAuth(window.WC.currentUser || null);
  }
});
