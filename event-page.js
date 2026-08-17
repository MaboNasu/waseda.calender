/**
 * event-page.js - イベント個別詳細ページ (event.html?id=evt-001)
 * script.js のヘルパー関数・モーダル用HTML生成関数を再利用して同じ内容を表示する。
 */

/** 個別ページのURLから直接アクセスされた場合、isPublished:falseの下書きは見せない */
function findPublishedEventById(eventId) {
  const allEvents = typeof EVENTS !== 'undefined' ? EVENTS : [];
  const ev = allEvents.find(e => String(e.id) === String(eventId));
  return ev && ev.isPublished ? ev : null;
}

function renderEventNotFound() {
  const wrap = document.getElementById('event-detail');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">📭</div>
      <p>指定されたイベントが見つかりませんでした。削除済み、または非公開の可能性があります。</p>
      <p><a class="btn btn-ghost btn-sm" href="index.html">トップページに戻る</a></p>
    </div>`;
}

/** 外部リンククリック時にGA4へevent_link_clickイベントを送信する（リンク自体の遷移は妨げない） */
function trackEventExternalLinkClick(eventId) {
  if (typeof gtag === 'function') {
    gtag('event', 'event_link_click', { event_id: eventId });
  }
}

/** Googleマップリンククリック時にGA4へevent_map_clickイベントを送信する（遷移は妨げない） */
function trackEventMapClick(eventId) {
  if (typeof gtag === 'function') {
    gtag('event', 'event_map_click', { event_id: eventId });
  }
}

/** OGP用の説明文（改行を除去し、長すぎる場合は切り詰める） */
function buildOgDescription(ev) {
  const base = ev.description ? ev.description.replace(/\s+/g, ' ').trim() : '';
  const text = base || `${formatEventDateDisplay(ev)} ${ev.organizer || ''}`.trim();
  return text.length > 100 ? text.slice(0, 100) + '…' : text;
}

/**
 * イベント個別ページのJSON-LDを<head>に埋め込む。
 * buildEventJsonLd()・CAMPUS_ADDRESS は script.js 側で定義済み（ホームページの一覧用と共有）。
 * ここでは個別ページ自身のURLを渡すことで、ホームページ向けの汎用URLではなく
 * このイベント固有のURLがJSON-LDに入るようにする。
 */
function injectEventJsonLd(ev) {
  const existing = document.getElementById('event-page-jsonld');
  if (existing) existing.remove();
  const pageUrl = buildEventPageUrl(ev);
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'event-page-jsonld';
  script.textContent = JSON.stringify(buildEventJsonLd(ev, pageUrl));
  document.head.appendChild(script);
}

/** タイトル・OGP・canonicalを、表示中のイベントの内容に書き換える（JSを実行するクローラー向けの補助。実行しないクローラーには初期値のまま表示される）。
 *  canonical/og:urlは常に静的プリレンダリング版（buildEventPageUrl）を指す。この関数が動くのは
 *  ①静的生成された event/{id}.html 自身（値は変わらない）か、②後方互換で残している旧 event.html?id=X
 *  のどちらか。②の場合、この記述によって検索エンジンには「正規版はevent/{id}.htmlの方」と伝わる。 */
function updateEventPageMeta(ev) {
  const pageTitle = `${ev.title} – Waseda Calendar`;
  const description = buildOgDescription(ev);
  const url = buildEventPageUrl(ev);

  document.title = pageTitle;
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  const setAttr = (id, attr, value) => { const el = document.getElementById(id); if (el) el.setAttribute(attr, value); };

  setText('event-page-title', pageTitle);
  setAttr('event-page-description', 'content', description);
  setAttr('event-page-canonical', 'href', url);
  setAttr('event-page-og-title', 'content', pageTitle);
  setAttr('event-page-og-description', 'content', description);
  setAttr('event-page-og-url', 'content', url);
  setAttr('event-page-twitter-title', 'content', pageTitle);
  setAttr('event-page-twitter-description', 'content', description);
}

/**
 * 関連イベントを選ぶ（同主催団体→同カテゴリ→開催日が近い→同キャンパスの順で加点し上位を採用）。
 * 開催予定のイベントを優先し、無ければ終了済みも許容する（欄が完全に空になるのを避けるため）。
 */
function getRelatedEvents(ev, limit = 6) {
  const today = getTodayStr();
  const candidates = getPublishedEvents().filter(e => String(e.id) !== String(ev.id));
  const upcoming = candidates.filter(e => getEventEnd(e) >= today);
  const pool = upcoming.length > 0 ? upcoming : candidates;

  const scored = pool.map(e => {
    let score = 0;
    if (ev.orgId && e.orgId === ev.orgId) score += 100;
    else if (!ev.orgId && ev.organizer && e.organizer === ev.organizer) score += 90;
    if (e.category === ev.category) score += 20;
    if (e.campus === ev.campus) score += 5;
    const dayDiff = Math.abs(new Date(e.date) - new Date(ev.date)) / 86400000;
    score += Math.max(0, 10 - dayDiff / 3);
    return { e, score };
  });
  scored.sort((a, b) => b.score - a.score || a.e.date.localeCompare(b.e.date));

  const seen = new Set();
  const result = [];
  for (const { e } of scored) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    result.push(e);
    if (result.length >= limit) break;
  }
  return result;
}

/** 個別ページ下部の関連イベント欄。既存のcreateEventCardHTML（一覧と同じカード）をそのまま再利用する。
 *  該当が無い場合は欄ごと非表示にする。クリックはイベント委譲で1箇所だけ計測する。 */
function renderRelatedEvents(ev) {
  const wrap = document.getElementById('event-related');
  if (!wrap) return;
  const related = getRelatedEvents(ev);
  if (related.length === 0) { wrap.innerHTML = ''; return; }

  wrap.innerHTML = `
    <div class="related-events-section">
      <h2 class="section-title">関連イベント</h2>
      <div class="events-grid">
        ${related.map(e => createEventCardHTML(e, true)).join('')}
      </div>
    </div>`;

  wrap.onclick = (e) => {
    const card = e.target.closest('.event-card');
    if (card) trackEvent('event_related_click', { event_id: card.dataset.id, from_event_id: ev.id });
  };

  refreshLiveReactionCounts(related.map(e => e.id));
}

function renderEventDetailPage(ev) {
  const wrap = document.getElementById('event-detail');
  if (!wrap) return;

  updateEventPageMeta(ev);
  injectEventJsonLd(ev);

  const extLinkHTML = ev.externalUrl
    ? `<a href="${escapeHtml(ev.externalUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-enjy" onclick="trackEventExternalLinkClick('${escapeHtml(String(ev.id))}')">公式・詳細情報を見る ↗</a>`
    : '';
  const mapsUrl = buildMapsSearchUrl(ev);
  const mapLinkHTML = mapsUrl
    ? `<a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer" class="event-map-link" onclick="trackEventMapClick('${escapeHtml(String(ev.id))}')">🗺 Googleマップで見る ↗</a>`
    : '';
  const chipsHTML = participationChipsHTML(ev);

  wrap.innerHTML = `
    <div class="modal-header event-page-header">
      <h1 class="modal-title">${escapeHtml(ev.title)}</h1>
    </div>
    <div class="modal-body">
      <div class="modal-tags mb-2">
        ${endedTagHTML(ev)}
        <span class="tag ${categoryClass(ev.category)}">${categoryLabel(ev.category)}</span>
      </div>

      <div class="event-hero-info">
        <div class="event-hero-row">📅 ${formatEventDateDisplay(ev)}${ev.startTime ? `　${escapeHtml(formatTime(ev.startTime, ev.endTime))}` : '　終日'}</div>
        <div class="event-hero-row">📍 ${escapeHtml(ev.location || '場所は未定・確認中です')}</div>
      </div>

      <div class="event-participation-box">
        <p class="event-participation-title">参加について</p>
        <div class="event-participation-chips">
          ${chipsHTML}
          <span class="tag ${feeClass(ev.feeType)}">💴 ${escapeHtml(ev.feeText || feeLabel(ev.feeType))}</span>
        </div>
        ${mapLinkHTML}
        ${extLinkHTML ? `<div class="event-participation-cta">${extLinkHTML}</div>` : ''}
      </div>

      ${createReactionButtonsHTML(ev)}
      <div class="modal-share-actions">${createModalShareActionsHTML(ev)}</div>
      ${ev.description ? `
        <div>
          <p class="modal-desc-label">イベント説明</p>
          <p class="modal-desc-text">${escapeHtml(ev.description)}</p>
        </div>` : ''}

      <div class="modal-detail-grid event-secondary-info">
        <div class="modal-detail-item">
          <span class="modal-detail-label">主催団体</span>
          <span class="modal-detail-value">${escapeHtml(ev.organizer || '—')}</span>
        </div>
        <div class="modal-detail-item">
          <span class="modal-detail-label">キャンパス区分</span>
          <span class="modal-detail-value">${campusLabel(ev.campus)}</span>
        </div>
        <div class="modal-detail-item">
          <span class="modal-detail-label">対象者</span>
          <span class="modal-detail-value">${targetLabel(ev.target)}</span>
        </div>
      </div>

      <div class="modal-footer">
        <span class="modal-updated">${ev.lastUpdated ? `最終更新: ${escapeHtml(ev.lastUpdated)}` : ''}</span>
      </div>
    </div>`;

  refreshLiveReactionCounts([ev.id]);
  renderRelatedEvents(ev);

  if (typeof gtag === 'function') {
    gtag('event', 'event_view', { event_id: ev.id });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const nav = document.getElementById('mobile-nav');
  if (hamburgerBtn && nav) {
    hamburgerBtn.addEventListener('click', () => {
      nav.classList.toggle('open');
      hamburgerBtn.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
    });
    document.addEventListener('click', (e) => {
      if (!hamburgerBtn.contains(e.target) && !nav.contains(e.target)) {
        nav.classList.remove('open');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // 新URL形式（event/evt-XXX.html）にはクエリパラメータが無いため、パスからも抽出できるようにする。
  // 旧形式（event.html?id=evt-XXX）は後方互換のため引き続きクエリパラメータを優先的に見る。
  const params = new URLSearchParams(window.location.search);
  const pathMatch = window.location.pathname.match(/\/event\/([^/]+)\.html$/);
  const id = params.get('id') || (pathMatch ? decodeURIComponent(pathMatch[1]) : null);
  const ev = id ? findPublishedEventById(id) : null;

  if (ev) {
    renderEventDetailPage(ev);
  } else {
    renderEventNotFound();
  }
});
