/**
 * organizations-page.js - 公認団体ページ
 */

const ORG_GENRES = ['すべて', '体育各部', 'スポーツ', '文化', '音楽', '演劇', '講演', '地域', '稲門会', 'その他'];

/** 1ページあたりの表示件数 */
const ORG_PAGE_SIZE = 20;

/** 団体一覧の表示サイズ（大=2列/中=3列/小=5列）をlocalStorageに保存するキー */
const ORG_COLUMNS_STORAGE_KEY = 'wc-org-columns';

function getStoredOrgColumns() {
  try {
    return localStorage.getItem(ORG_COLUMNS_STORAGE_KEY) || '2';
  } catch (e) {
    return '2';
  }
}

function setStoredOrgColumns(value) {
  try {
    localStorage.setItem(ORG_COLUMNS_STORAGE_KEY, value);
  } catch (e) {
    // localStorageが使えない環境では保存をスキップ
  }
}

let organizationState = {
  genre: 'すべて',
  sort: 'listed',
  keyword: '',
  selectedId: '',
  page: 1
};

/** モバイル幅(768px以下、.org-layoutが1カラムになる閾値と同じ)では、サイドの詳細asideが
 *  グリッドより上(order:-1)に配置され画面外になるため、カードタップ時のインライン更新では
 *  結果が見えない。その幅ではカードタップ＝団体詳細ページへの通常遷移に切り替える。 */
function isMobileOrgLayout() {
  return window.matchMedia('(max-width: 768px)').matches;
}

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

/** 団体に紐づくイベントかどうか（orgIdでの紐づけ、団体側のrelatedEventIdsでの紐づけ、
 *  主催団体名（organizer）の完全一致のいずれかに対応）。
 *  events.js側はorgIdがほとんど未設定で、代わりに主催団体名を自由記述のorganizerに
 *  入れている実態があるため、organizer完全一致も紐づけ対象に含めている。 */
function isEventRelatedToOrg(ev, org) {
  if (ev.orgId && String(ev.orgId) === String(org.id)) return true;
  const ids = Array.isArray(org.relatedEventIds) ? org.relatedEventIds.map(String) : [];
  if (ids.includes(String(ev.id))) return true;
  return !!(ev.organizer && org.name && String(ev.organizer).trim() === String(org.name).trim());
}

/** 団体個別ページの絶対URL。org-page.js / scripts/generate-org-pages.js と同じ形式を維持すること */
function buildOrgPageUrl(org) {
  return `https://wasedacalendar.com/org/${encodeURIComponent(org.id)}.html`;
}

/** イベント個別ページの絶対URL。script.js の buildEventPageUrl と同じ形式を維持すること */
function orgPageBuildEventPageUrl(ev) {
  return `https://wasedacalendar.com/event/${encodeURIComponent(ev.id)}.html`;
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
      if (organizationState.sort === 'listed') {
        const listedDiff = (isOrgListed(b) ? 1 : 0) - (isOrgListed(a) ? 1 : 0);
        if (listedDiff !== 0) return listedDiff;
        return String(a.nameKana || a.name).localeCompare(String(b.nameKana || b.name), 'ja');
      }
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

/** 説明文(description)が未登録の団体向けの代替表示。「準備中」という素っ気ない固定文の代わりに、
 *  イベント実績があるならジャンル・件数から文章を組み立て、無いならお問い合わせフォームへ誘導する
 *  （空欄を掲載依頼の呼びかけとして活用する）。card一覧・団体個別ページの両方から呼ぶ共通関数。 */
function orgDescriptionHTML(org, extraClass) {
  const cls = extraClass ? ` class="${extraClass}"` : '';
  if (org.description && org.description.trim()) {
    return `<p${cls}>${orgEscapeHtml(org.description)}</p>`;
  }
  const eventCount = getEventsForOrganization(org).length + getPastEventsForOrganization(org).length;
  if (eventCount > 0) {
    const genre = org.genre || 'その他';
    return `<p${cls}>早稲田大学の${orgEscapeHtml(genre)}系団体。${eventCount}件のイベントを掲載中です。</p>`;
  }
  const ctaCls = extraClass ? `${extraClass} org-desc-cta` : 'org-desc-cta';
  return `<p class="${ctaCls}">団体概要はまだ登録されていません。運営メンバーの方は<a href="contact.html#contact-form">こちらから掲載依頼</a>できます。</p>`;
}

function orgListedBadgeHTML(org) {
  return isOrgListed(org) ? '<span class="org-listed-badge">掲載中</span>' : '';
}

/** ページ番号ボタンのHTML（現在ページ前後2件＋先頭・末尾のみ表示し、間は「…」で省略する） */
function renderOrgPaginationHTML(totalItems) {
  const totalPages = Math.ceil(totalItems / ORG_PAGE_SIZE);
  if (totalPages <= 1) return '';

  const current = organizationState.page;
  const pages = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - current) <= 2) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== '…') {
      pages.push('…');
    }
  }

  const buttons = pages.map(p =>
    p === '…'
      ? `<span class="org-page-ellipsis">…</span>`
      : `<button type="button" class="org-page-btn${p === current ? ' active' : ''}" onclick="goToOrgPage(${p})" ${p === current ? 'aria-current="page"' : ''}>${p}</button>`
  ).join('');

  const prevDisabled = current <= 1 ? 'disabled' : '';
  const nextDisabled = current >= totalPages ? 'disabled' : '';

  return `
    <nav class="org-pagination" aria-label="ページ送り">
      <button type="button" class="org-page-btn org-page-nav" onclick="goToOrgPage(${current - 1})" ${prevDisabled}>‹ 前へ</button>
      ${buttons}
      <button type="button" class="org-page-btn org-page-nav" onclick="goToOrgPage(${current + 1})" ${nextDisabled}>次へ ›</button>
    </nav>`;
}

function goToOrgPage(page) {
  const totalItems = filteredOrganizations().length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ORG_PAGE_SIZE));
  organizationState.page = Math.min(Math.max(1, page), totalPages);
  renderOrganizationCards();
  const listEl = document.getElementById('organizations-list');
  if (listEl) listEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderOrganizationCards() {
  const wrap = document.getElementById('organizations-list');
  const count = document.getElementById('organizations-count');
  const pagination = document.getElementById('organizations-pagination');
  if (!wrap) return;

  const items = filteredOrganizations();
  if (count) count.textContent = `${items.length}件`;

  wrap.className = `org-grid org-grid-cols-${getStoredOrgColumns()}`;

  if (items.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🏫</div>
        <p>条件に一致する団体はありません。</p>
      </div>`;
    if (pagination) pagination.innerHTML = '';
    renderOrganizationDetail(null);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(items.length / ORG_PAGE_SIZE));
  if (organizationState.page > totalPages) organizationState.page = totalPages;
  const pageItems = items.slice((organizationState.page - 1) * ORG_PAGE_SIZE, organizationState.page * ORG_PAGE_SIZE);

  if (!organizationState.selectedId || !items.some(org => org.id === organizationState.selectedId)) {
    organizationState.selectedId = pageItems[0].id;
  }

  wrap.innerHTML = pageItems.map(org => {
    const related = getEventsForOrganization(org);
    const activeClass = org.id === organizationState.selectedId ? ' active' : '';
    return `
      <article class="org-card${activeClass}" onclick="handleOrgCardClick(event, '${orgEscapeHtml(org.id)}')">
        <a class="org-name-btn" href="${buildOrgPageUrl(org)}" onclick="return handleOrgDetailClick(event, '${orgEscapeHtml(org.id)}')">
          ${orgEscapeHtml(org.name)}
        </a>
        <span class="org-genre">${orgEscapeHtml(org.genre || 'その他')}</span>
        ${orgListedBadgeHTML(org)}
        ${orgDescriptionHTML(org)}
        ${organizationLinksHTML(org)}
        ${related.length ? `<button class="org-related-btn" type="button" onclick="handleOrgCardClick(event, '${orgEscapeHtml(org.id)}')">関連イベント ${related.length}件を見る</button>` : ''}
      </article>`;
  }).join('');

  if (pagination) pagination.innerHTML = renderOrgPaginationHTML(items.length);

  renderOrganizationDetail(getOrganizations().find(org => org.id === organizationState.selectedId));
}

/** @param {{headingTag?: string}} [options] 団体名の見出しタグ。一覧ページのasideではh2（省略時の既定）、
 *  団体個別ページ(org.html/org/{id}.html)ではページ内で唯一の見出しとしてh1を渡す。 */
function renderOrganizationDetail(org, options) {
  const detail = document.getElementById('organization-detail');
  if (!detail) return;
  const headingTag = (options && options.headingTag) || 'h2';

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
      <${headingTag}>${orgEscapeHtml(org.name)}</${headingTag}>
      <p>${orgEscapeHtml(org.nameKana || '')}</p>
      <p>${orgEscapeHtml(org.alphabetName || '')}</p>
      <button type="button" class="btn btn-ghost btn-sm org-follow-btn" id="org-follow-btn"
        onclick="handleOrgFollowClick('${orgEscapeHtml(org.id)}', this)" disabled>フォローする</button>
    </div>
    ${orgDescriptionHTML(org, 'org-detail-desc')}
    ${organizationLinksHTML(org)}
    <div class="org-related">
      <h3>関連イベント</h3>
      ${related.length === 0 ? '<p class="org-muted">関連イベントはまだ登録されていません。</p>' : related.map(ev => `
        <a class="org-related-event" href="${orgPageBuildEventPageUrl(ev)}">
          <strong>${orgEscapeHtml(ev.title)}</strong>
          <span>${orgEscapeHtml(ev.date)} ${orgEscapeHtml(ev.startTime || '')}</span>
        </a>`).join('')}
    </div>
    ${renderOrgPastEventsHTML(org)}`;

  refreshOrgFollowButton(org.id);
}

/** 団体カードのリンククリック処理。PC幅の一覧ページ(#organization-detail asideあり)では
 *  ページ遷移せずasideを更新、団体個別ページ等(aside無し)や768px以下のモバイル幅では
 *  通常通り遷移させる（asideがグリッドより上(order:-1)に回り込み画面外になり、
 *  インライン更新では結果が見えなくなるため）。
 *  （script.js の handleDetailLinkClick と同じパターン）。 */
function handleOrgDetailClick(e, orgId) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return true;
  if (!document.getElementById('organization-detail') || isMobileOrgLayout()) return true;
  e.preventDefault();
  selectOrganization(orgId);
  return false;
}

/** 団体カード全体・「関連イベントを見る」ボタンの共通クリック処理。
 *  名前リンクや外部リンクなど、カード内の別インタラクティブ要素からバブリングしてきたクリックは
 *  それぞれの本来の遷移を優先し、ここでは何もしない（ネストしたonclickの二重発火を防ぐ）。 */
function handleOrgCardClick(e, orgId) {
  const nested = e.target.closest('a, button');
  if (nested && nested !== e.currentTarget) return;
  if (isMobileOrgLayout()) {
    const org = getOrganizations().find(o => o.id === orgId);
    if (org) window.location.href = buildOrgPageUrl(org);
    return;
  }
  selectOrganization(orgId);
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
      window.WC.auth.signInWithGoogle().catch((err) => {
        const message = typeof translateAuthError === 'function' ? translateAuthError(err) : 'ログインに失敗しました。時間をおいて再度お試しください。';
        if (message && typeof renderHeaderAuthError === 'function') renderHeaderAuthError(message);
      });
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
        <a class="org-related-event org-archive-event" href="${orgPageBuildEventPageUrl(ev)}">
          <strong>${orgEscapeHtml(ev.title)}</strong>
          <span>${orgEscapeHtml(ev.date)}${ev.endDate && ev.endDate !== ev.date ? `〜${orgEscapeHtml(ev.endDate)}` : ''}</span>
        </a>`).join('')}
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
    organizationState.page = 1;
    renderOrganizationCards();
  });
  if (sort) sort.addEventListener('change', () => {
    organizationState.sort = sort.value;
    organizationState.page = 1;
    renderOrganizationCards();
  });
  if (keyword) keyword.addEventListener('input', () => {
    organizationState.keyword = keyword.value;
    organizationState.selectedId = '';
    organizationState.page = 1;
    renderOrganizationCards();
  });
}

/** 1行あたりの表示件数（列数）の切り替え */
function setupOrgColumnsToggle() {
  const buttons = document.querySelectorAll('.org-columns-btn');
  if (!buttons.length) return;

  const stored = getStoredOrgColumns();
  buttons.forEach(btn => btn.classList.toggle('active', btn.dataset.columns === stored));

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setStoredOrgColumns(btn.dataset.columns);
      const wrap = document.getElementById('organizations-list');
      if (wrap) wrap.className = `org-grid org-grid-cols-${btn.dataset.columns}`;
    });
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
  setupOrgColumnsToggle();
  applyOrganizationIdFromUrl();
  renderOrganizationCards();
});
