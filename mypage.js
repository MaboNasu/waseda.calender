/**
 * mypage.js - マイページ（お気に入りイベント一覧）
 * script.js の createEventCardHTML 等を再利用し、Firestoreのお気に入りデータと events.js を突き合わせて表示する。
 */
function renderMypageLoggedOut() {
  const wrap = document.getElementById('mypage-content');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">🔒</div>
      <p>マイページを利用するには、Googleでログインしてください。</p>
      <p><button type="button" class="btn btn-enjy btn-sm" id="mypage-login-btn">Googleでログイン</button></p>
    </div>`;
  const btn = document.getElementById('mypage-login-btn');
  if (btn) btn.addEventListener('click', () => window.WC.auth.signInWithGoogle().catch(() => {}));
}

async function renderMypageLoggedIn() {
  const wrap = document.getElementById('mypage-content');
  if (!wrap) return;
  wrap.innerHTML = `<div class="empty-state"><p>読み込み中...</p></div>`;

  let favorites = [];
  try {
    favorites = await window.WC.auth.getFavorites();
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠</div><p>お気に入りの読み込みに失敗しました。時間をおいて再度お試しください。</p></div>`;
    return;
  }

  if (favorites.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <p>まだお気に入りのイベントがありません。イベント詳細の「気になる」「行きたい」「参加予定」ボタンから追加できます。</p>
      </div>`;
    return;
  }

  const allEvents = typeof EVENTS !== 'undefined' ? EVENTS : [];
  const favoriteIds = favorites.map(f => String(f.id));
  const events = allEvents
    .filter(ev => ev.isPublished && favoriteIds.includes(String(ev.id)))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (events.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <p>お気に入りに登録されているイベントは、現在掲載されていないか終了済みのようです。</p>
      </div>`;
    return;
  }

  wrap.innerHTML = `<div class="events-grid">${events.map(ev => createEventCardHTML(ev, true)).join('')}</div>`;
}

function renderMypage(user) {
  if (user) {
    renderMypageLoggedIn();
  } else {
    renderMypageLoggedOut();
  }
}

window.addEventListener('wc-auth-changed', (e) => {
  renderMypage(e.detail.user);
});

document.addEventListener('DOMContentLoaded', () => {
  if (window.WC && window.WC.firebaseReady) {
    renderMypage(window.WC.currentUser || null);
  } else {
    renderMypageLoggedOut();
  }
});
