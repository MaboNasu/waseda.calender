/**
 * mypage.js - マイページ（お気に入りイベント一覧・フォロー中の団体一覧）
 * script.js の createEventCardHTML 等を再利用し、Firestoreのお気に入り/団体フォローデータと
 * events.js / organizations.js を突き合わせて表示する。
 */
let mypageLoginInProgress = false;

async function handleMypageLoginClick(btn) {
  if (mypageLoginInProgress) return;
  mypageLoginInProgress = true;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'ログイン中…';
  try {
    await window.WC.auth.signInWithGoogle();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = originalText;
    if (err && err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      alert('ログインに失敗しました。時間をおいて再度お試しください。');
    }
  } finally {
    mypageLoginInProgress = false;
  }
}

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
  if (btn) btn.addEventListener('click', () => handleMypageLoginClick(btn));
}

/** 今日から2日後（今日・明日・明後日）までの日付文字列 [today, today+2] */
function getReminderWindow() {
  const today = getTodayStr();
  const end = new Date();
  end.setDate(end.getDate() + 2);
  return { today, end: formatDateStr(end) };
}

/** イベントの開催期間が [today, today+2] の範囲に重なっているか（開催中の複数日イベントも含む） */
function isEventInReminderWindow(ev, today, windowEnd) {
  const start = ev.date;
  const end = ev.endDate || ev.date;
  return start <= windowEnd && end >= today;
}

/**
 * フォロー中団体に紐づくイベントIDの集合を作る。
 * organizations-page.js の isEventRelatedToOrg と同じ方針（ev.orgId一致 または 団体側のrelatedEventIds）で判定する。
 */
function collectFollowedOrgEventIds(followedOrgIds) {
  const allOrgs = typeof ORGANIZATIONS !== 'undefined' ? ORGANIZATIONS : [];
  const ids = new Set();
  allOrgs
    .filter(org => followedOrgIds.includes(String(org.id)))
    .forEach(org => {
      (Array.isArray(org.relatedEventIds) ? org.relatedEventIds : []).forEach(id => ids.add(String(id)));
    });
  return ids;
}

/** リマインド対象イベントを収集する（お気に入り・フォロー中団体のイベントのうち、今日〜明後日に該当するもの） */
function collectReminderEvents(favorites, followedOrgIds) {
  const allEvents = typeof EVENTS !== 'undefined' ? EVENTS : [];
  const { today, end } = getReminderWindow();
  const favoriteIds = favorites.map(f => String(f.id));
  const followedOrgEventIds = collectFollowedOrgEventIds(followedOrgIds);
  const reasonById = new Map();

  allEvents.forEach(ev => {
    if (!ev.isPublished || !isEventInReminderWindow(ev, today, end)) return;
    const reasons = [];
    if (favoriteIds.includes(String(ev.id))) reasons.push('お気に入り');
    const isFollowedOrgEvent = (ev.orgId && followedOrgIds.includes(String(ev.orgId))) || followedOrgEventIds.has(String(ev.id));
    if (isFollowedOrgEvent) reasons.push('フォロー団体');
    if (reasons.length > 0) reasonById.set(ev, reasons);
  });

  return [...reasonById.entries()]
    .sort((a, b) => a[0].date.localeCompare(b[0].date));
}

/** リマインドセクションのHTML（対象が無い場合は空文字＝非表示） */
function renderMypageReminderHTML(favorites, followedOrgIds) {
  const items = collectReminderEvents(favorites, followedOrgIds);
  if (items.length === 0) return '';

  return `
    <div class="mypage-section mypage-reminder">
      <h2 class="section-title">🔔 まもなく開催（今日・明日・明後日）</h2>
      <div class="events-grid">${items.map(([ev, reasons]) => `
        <div class="reminder-card-wrap">
          <div class="reminder-reasons">${reasons.map(r => `<span class="reminder-reason-tag">${escapeHtml(r)}</span>`).join('')}</div>
          ${createEventCardHTML(ev, true)}
        </div>`).join('')}</div>
    </div>`;
}

/** お気に入りイベント一覧のHTML（見出し込み） */
function renderMypageFavoritesHTML(favorites) {
  const allEvents = typeof EVENTS !== 'undefined' ? EVENTS : [];
  const favoriteIds = favorites.map(f => String(f.id));
  const events = allEvents
    .filter(ev => ev.isPublished && favoriteIds.includes(String(ev.id)))
    .sort((a, b) => a.date.localeCompare(b.date));

  const body = events.length === 0
    ? `<div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <p>${favorites.length === 0
          ? 'まだお気に入りのイベントがありません。イベント詳細の「気になる」「行きたい」「参加予定」ボタンから追加できます。'
          : 'お気に入りに登録されているイベントは、現在掲載されていないか終了済みのようです。'}</p>
      </div>`
    : `<div class="events-grid">${events.map(ev => createEventCardHTML(ev, true)).join('')}</div>`;

  return `
    <div class="mypage-section">
      <h2 class="section-title">お気に入りイベント</h2>
      ${body}
    </div>`;
}

/** フォロー中の団体一覧のHTML（見出し込み） */
function renderMypageOrgFollowsHTML(followedOrgIds) {
  const allOrgs = typeof ORGANIZATIONS !== 'undefined' ? ORGANIZATIONS : [];
  const orgs = allOrgs
    .filter(org => followedOrgIds.includes(String(org.id)))
    .sort((a, b) => String(a.nameKana || a.name).localeCompare(String(b.nameKana || b.name), 'ja'));

  const body = orgs.length === 0
    ? `<div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <p>まだフォロー中の団体がありません。<a href="organizations.html">公認サークル</a>の団体詳細から「フォローする」で追加できます。</p>
      </div>`
    : `<div class="org-follow-list">${orgs.map(org => `
        <article class="org-follow-card">
          <div>
            <span class="org-genre">${escapeHtml(org.genre || 'その他')}</span>
            <h3><a href="organizations.html?id=${encodeURIComponent(org.id)}">${escapeHtml(org.name)}</a></h3>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="handleMypageUnfollow('${escapeHtml(String(org.id))}', this)">フォロー解除</button>
        </article>`).join('')}</div>`;

  return `
    <div class="mypage-section">
      <h2 class="section-title">フォロー中の団体</h2>
      ${body}
    </div>`;
}

async function renderMypageLoggedIn() {
  const wrap = document.getElementById('mypage-content');
  if (!wrap) return;
  wrap.innerHTML = `<div class="empty-state"><p>読み込み中...</p></div>`;

  let favorites = [];
  let followedOrgIds = [];
  try {
    [favorites, followedOrgIds] = await Promise.all([
      window.WC.auth.getFavorites(),
      window.WC.auth.getOrgFollows()
    ]);
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠</div><p>データの読み込みに失敗しました。時間をおいて再度お試しください。</p></div>`;
    return;
  }

  wrap.innerHTML = renderMypageReminderHTML(favorites, followedOrgIds)
    + renderMypageFavoritesHTML(favorites)
    + renderMypageOrgFollowsHTML(followedOrgIds);
}

/** マイページの「フォロー解除」ボタン */
async function handleMypageUnfollow(orgId, btnEl) {
  if (!window.WC || !window.WC.auth) return;
  if (btnEl) btnEl.disabled = true;
  try {
    await window.WC.auth.setOrgFollow(orgId, true);
  } catch (err) {
    alert('通信エラーが発生しました。時間をおいて再度お試しください。');
  }
  renderMypageLoggedIn();
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
