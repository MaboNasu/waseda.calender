/**
 * organizations-page.js - 掲載団体一覧ページ
 */

const ORG_GENRES = ['すべて', 'スポーツ', '文化', '音楽', '演劇', '講演', '地域', 'その他'];

let organizationState = {
  genre: 'すべて',
  sort: 'kana',
  keyword: '',
  selectedId: ''
};

function orgEscapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getOrganizations() {
  return typeof ORGANIZATIONS !== 'undefined' ? ORGANIZATIONS : [];
}

/** 今日の日付文字列 YYYY-MM-DD（script.jsのgetTodayStrと同じ仕様） */
function orgPageTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** イベントの終了日（endDate未指定ならdateと同日） */
function orgPageEventEnd(ev) {
  return ev.endDate || ev.date;
}

/** 団体に紐づくイベントかどうか（orgIdでの紐づけ、または団体側のrelatedEventIdsでの紐づけの両方に対応） */
function isEventRelatedToOrg(ev, org) {
  if (ev.orgId && String(ev.orgId) === String(org.id)) return true;
  const ids = Array.isArray(org.relatedEventIds) ? org.relatedEventIds.map(String) : [];
  return ids.includes(String(ev.id));
}

/** 団体の開催予定イベント（終了していない、公開済みのもの） */
function getEventsForOrganization(org) {
  const events = typeof EVENTS !== 'undefined' ? EVENTS : [];
  const today = orgPageTodayStr();
  return events.filter(ev => ev.isPublished && isEventRelatedToOrg(ev, org) && orgPageEventEnd(ev) >= today);
}

/** 団体の開催実績（終了済み・公開済みのイベント、開催日の新しい順） */
function getPastEventsForOrganization(org) {
  const events = typeof EVENTS !== 'undefined' ? EVENTS : [];
  const today = orgPageTodayStr();
  return events
    .filter(ev => ev.isPublished && isEventRelatedToOrg(ev, org) && orgPageEventEnd(ev) < today)
    .sort((a, b) => b.date.localeCompare(a.date));
}

function renderGenreOptions() {
  const select = document.getElementById('org-genre');
  if (!select) return;
  select.innerHTML = ORG_GENRES.map(genre =>
    `<option value="${orgEscapeHtml(genre)}">${orgEscapeHtml(genre)}</option>`
  ).join('');
}

function filteredOrganizations() {
  const keyword = organizationState.keyword.trim().toLowerCase();
  return getOrganizations()
    .filter(org => organizationState.genre === 'すべて' || org.genre === organizationState.genre)
    .filter(org => {
      if (!keyword) return true;
      const haystack = [
        org.name,
        org.nameKana,
        org.alphabetName,
        org.description,
        org.genre
      ].join(' ').toLowerCase();
      return haystack.includes(keyword);
    })
    .sort((a, b) => {
      const key = organizationState.sort === 'alphabet' ? 'alphabetName' : 'nameKana';
      return String(a[key] || a.name).localeCompare(String(b[key] || b.name), 'ja');
    });
}

function organizationLinksHTML(org) {
  const links = [];
  if (org.instagramUrl) {
    links.push(`<a href="${orgEscapeHtml(org.instagramUrl)}" target="_blank" rel="noopener noreferrer" class="org-link">Instagram ↗</a>`);
  }
  if (org.twitterUrl) {
    links.push(`<a href="${orgEscapeHtml(org.twitterUrl)}" target="_blank" rel="noopener noreferrer" class="org-link">X ↗</a>`);
  }
  if (org.websiteUrl) {
    links.push(`<a href="${orgEscapeHtml(org.websiteUrl)}" target="_blank" rel="noopener noreferrer" class="org-link">公式サイト ↗</a>`);
  }
  if (org.guideUrl) {
    links.push(`<a href="${orgEscapeHtml(org.guideUrl)}" target="_blank" rel="noopener noreferrer" class="org-link">サークルガイド ↗</a>`);
  }
  return links.length ? `<div class="org-links">${links.join('')}</div>` : '';
}

/** 実際にイベントが（開催予定・開催実績のいずれかで）紐づいているかどうかで「掲載中」を自動判定する */
function isOrgListed(org) {
  return getEventsForOrganization(org).length > 0 || getPastEventsForOrganization(org).length > 0;
}

function orgListedBadgeHTML(org) {
  return isOrgListed(org) ? '<span class="org-listed-badge">掲載中</span>' : '';
}

function renderOrganizationCards() {
  const wrap = document.getElementById('organizations-list');
  const count = document.getElementById('organizations-count');
  if (!wrap) return;

  const items = filteredOrganizations();
  if (count) count.textContent = `${items.length}件`;

  if (items.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🏫</div>
        <p>条件に一致する団体はありません。</p>
      </div>`;
    renderOrganizationDetail(null);
    return;
  }

  if (!organizationState.selectedId || !items.some(org => org.id === organizationState.selectedId)) {
    organizationState.selectedId = items[0].id;
  }

  wrap.innerHTML = items.map(org => {
    const related = getEventsForOrganization(org);
    const activeClass = org.id === organizationState.selectedId ? ' active' : '';
    return `
      <article class="org-card${activeClass}">
        <button class="org-name-btn" type="button" onclick="selectOrganization('${orgEscapeHtml(org.id)}')">
          ${orgEscapeHtml(org.name)}
        </button>
        <span class="org-genre">${orgEscapeHtml(org.genre || 'その他')}</span>
        ${orgListedBadgeHTML(org)}
        <p>${orgEscapeHtml(org.description || '団体概要は準備中です。')}</p>
        ${organizationLinksHTML(org)}
        ${related.length ? `<button class="org-related-btn" type="button" onclick="selectOrganization('${orgEscapeHtml(org.id)}')">関連イベント ${related.length}件を見る</button>` : ''}
      </article>`;
  }).join('');

  renderOrganizationDetail(getOrganizations().find(org => org.id === organizationState.selectedId));
}

function renderOrganizationDetail(org) {
  const detail = document.getElementById('organization-detail');
  if (!detail) return;

  if (!org) {
    detail.innerHTML = `
      <div class="org-detail-empty">
        <p>団体を選択すると詳細が表示されます。</p>
      </div>`;
    return;
  }

  const related = getEventsForOrganization(org);
  detail.innerHTML = `
    <div class="org-detail-header">
      <span class="org-genre">${orgEscapeHtml(org.genre || 'その他')}</span>
      ${orgListedBadgeHTML(org)}
      <h2>${orgEscapeHtml(org.name)}</h2>
      <p>${orgEscapeHtml(org.nameKana || '')}</p>
      <p>${orgEscapeHtml(org.alphabetName || '')}</p>
      <button type="button" class="btn btn-ghost btn-sm org-follow-btn" id="org-follow-btn"
        onclick="handleOrgFollowClick('${orgEscapeHtml(org.id)}', this)" disabled>フォローする</button>
    </div>
    <p class="org-detail-desc">${orgEscapeHtml(org.description || '団体概要は準備中です。')}</p>
    ${organizationLinksHTML(org)}
    <div class="org-related">
      <h3>関連イベント</h3>
      ${related.length === 0 ? '<p class="org-muted">関連イベントはまだ登録されていません。</p>' : related.map(ev => `
        <a class="org-related-event" href="index.html#calendar-section">
          <strong>${orgEscapeHtml(ev.title)}</strong>
          <span>${orgEscapeHtml(ev.date)} ${orgEscapeHtml(ev.startTime || '')}</span>
        </a>`).join('')}
    </div>
    ${renderOrgPastEventsHTML(org)}`;

  refreshOrgFollowButton(org.id);
}

/* ============================================================
   団体フォロー（Googleログイン必須。状態はFirestoreに保存）
   ============================================================ */

/** フォローボタンの表示を現在のログイン状態・フォロー状態に合わせて更新する */
async function refreshOrgFollowButton(orgId) {
  const btn = document.getElementById('org-follow-btn');
  if (!btn) return;

  if (!window.WC || !window.WC.auth || !window.WC.currentUser) {
    btn.textContent = 'フォローする';
    btn.classList.remove('following');
    btn.disabled = false;
    return;
  }

  try {
    const follows = await window.WC.auth.getOrgFollows();
    const isFollowing = follows.includes(String(orgId));
    btn.textContent = isFollowing ? '✓ フォロー中' : 'フォローする';
    btn.classList.toggle('following', isFollowing);
  } catch (err) {
    btn.textContent = 'フォローする';
    btn.classList.remove('following');
  }
  btn.disabled = false;
}

async function handleOrgFollowClick(orgId, btnEl) {
  if (!window.WC || !window.WC.auth) {
    alert('準備中です。少し待ってから再度お試しください。');
    return;
  }
  if (!window.WC.currentUser) {
    if (confirm('団体のフォローにはログインが必要です。Googleでログインしますか？')) {
      window.WC.auth.signInWithGoogle().catch(() => {});
    }
    return;
  }

  const isFollowing = btnEl.classList.contains('following');
  btnEl.disabled = true;
  try {
    await window.WC.auth.setOrgFollow(orgId, isFollowing);
  } catch (err) {
    alert('通信エラーが発生しました。時間をおいて再度お試しください。');
  }
  refreshOrgFollowButton(orgId);
}

/** ログイン・ログアウトした時に、表示中の団体のフォローボタンを再判定する */
window.addEventListener('wc-auth-changed', () => {
  if (organizationState.selectedId) refreshOrgFollowButton(organizationState.selectedId);
});

/** 団体の開催実績（終了済みイベント）セクションのHTML */
function renderOrgPastEventsHTML(org) {
  const past = getPastEventsForOrganization(org);
  return `
    <div class="org-related org-archive">
      <h3>開催実績</h3>
      ${past.length === 0 ? '<p class="org-muted">開催実績はまだありません。</p>' : past.map(ev => `
        <div class="org-related-event org-archive-event">
          <strong>${orgEscapeHtml(ev.title)}</strong>
          <span>${orgEscapeHtml(ev.date)}${ev.endDate && ev.endDate !== ev.date ? `〜${orgEscapeHtml(ev.endDate)}` : ''}</span>
        </div>`).join('')}
    </div>`;
}

function selectOrganization(id) {
  organizationState.selectedId = id;
  renderOrganizationCards();
}

function setupOrganizationFilters() {
  renderGenreOptions();

  const genre = document.getElementById('org-genre');
  const sort = document.getElementById('org-sort');
  const keyword = document.getElementById('org-keyword');

  if (genre) genre.addEventListener('change', () => {
    organizationState.genre = genre.value;
    organizationState.selectedId = '';
    renderOrganizationCards();
  });
  if (sort) sort.addEventListener('change', () => {
    organizationState.sort = sort.value;
    renderOrganizationCards();
  });
  if (keyword) keyword.addEventListener('input', () => {
    organizationState.keyword = keyword.value;
    organizationState.selectedId = '';
    renderOrganizationCards();
  });
}

function setupOrganizationNav() {
  const btn = document.getElementById('hamburger-btn');
  const nav = document.getElementById('mobile-nav');
  if (!btn || !nav) return;

  btn.addEventListener('click', () => {
    nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
  });

  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !nav.contains(e.target)) {
      nav.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

/** ?id=org-001 のようなURLでアクセスした場合、該当団体を初期選択状態にする */
function applyOrganizationIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (id) organizationState.selectedId = id;
}

document.addEventListener('DOMContentLoaded', () => {
  setupOrganizationNav();
  setupOrganizationFilters();
  applyOrganizationIdFromUrl();
  renderOrganizationCards();
});
