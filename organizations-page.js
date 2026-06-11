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

function getEventsForOrganization(org) {
  const events = typeof EVENTS !== 'undefined' ? EVENTS : [];
  const ids = Array.isArray(org.relatedEventIds) ? org.relatedEventIds.map(String) : [];
  return events.filter(ev => ids.includes(String(ev.id)) && ev.isPublished);
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
  if (org.websiteUrl) {
    links.push(`<a href="${orgEscapeHtml(org.websiteUrl)}" target="_blank" rel="noopener noreferrer" class="org-link">公式サイト ↗</a>`);
  }
  return links.length ? `<div class="org-links">${links.join('')}</div>` : '';
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
      <h2>${orgEscapeHtml(org.name)}</h2>
      <p>${orgEscapeHtml(org.nameKana || '')}</p>
      <p>${orgEscapeHtml(org.alphabetName || '')}</p>
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

document.addEventListener('DOMContentLoaded', () => {
  setupOrganizationNav();
  setupOrganizationFilters();
  renderOrganizationCards();
});
