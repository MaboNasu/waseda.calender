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

/** OGP用の説明文（改行を除去し、長すぎる場合は切り詰める） */
function buildOgDescription(ev) {
  const base = ev.description ? ev.description.replace(/\s+/g, ' ').trim() : '';
  const text = base || `${formatEventDateDisplay(ev)} ${ev.organizer || ''}`.trim();
  return text.length > 100 ? text.slice(0, 100) + '…' : text;
}

/** date(+startTime) を Asia/Tokyo(+09:00) のISO 8601文字列にする。時刻が無ければ日付のみ返す（終日イベント向けの有効な表現） */
function toIsoDateTime(dateStr, timeStr) {
  if (!dateStr) return undefined;
  return timeStr ? `${dateStr}T${timeStr}:00+09:00` : dateStr;
}

/**
 * schema.org/Event のJSON-LD構造化データを組み立てる。
 * 画面に表示していない情報・確認できない情報（不明な参加費を無料扱いにする等）は入れない。
 */
function buildEventJsonLd(ev) {
  const url = `https://wasedacalendar.com/event.html?id=${encodeURIComponent(ev.id)}`;
  const isOnline = ev.campus === 'online';

  const data = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: ev.title,
    startDate: toIsoDateTime(ev.date, ev.startTime),
    endDate: toIsoDateTime(ev.endDate || ev.date, ev.endTime) || undefined,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: isOnline
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : 'https://schema.org/OfflineEventAttendanceMode',
    url,
    image: ['https://wasedacalendar.com/assets/og-image.png']
  };

  if (isOnline) {
    data.location = {
      '@type': 'VirtualLocation',
      url: ev.externalUrl || url
    };
  } else {
    data.location = {
      '@type': 'Place',
      name: ev.location || campusLabel(ev.campus),
      address: { '@type': 'PostalAddress', addressCountry: 'JP' }
    };
  }

  if (ev.description) data.description = ev.description;
  if (ev.organizer) data.organizer = { '@type': 'Organization', name: ev.organizer };

  // 参加費が「無料」と明確に分かっている場合のみofferを載せる。有料・不明な場合は金額を推測しない
  if (ev.feeType === 'free') {
    data.offers = {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'JPY',
      availability: 'https://schema.org/InStock',
      url
    };
  }

  return data;
}

function injectEventJsonLd(ev) {
  const existing = document.getElementById('event-page-jsonld');
  if (existing) existing.remove();
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'event-page-jsonld';
  script.textContent = JSON.stringify(buildEventJsonLd(ev));
  document.head.appendChild(script);
}

/** タイトル・OGP・canonicalを、表示中のイベントの内容に書き換える（JSを実行するクローラー向けの補助。実行しないクローラーには初期値のまま表示される） */
function updateEventPageMeta(ev) {
  const pageTitle = `${ev.title} – Waseda Calendar`;
  const description = buildOgDescription(ev);
  const url = `https://wasedacalendar.com/event.html?id=${encodeURIComponent(ev.id)}`;

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

function renderEventDetailPage(ev) {
  const wrap = document.getElementById('event-detail');
  if (!wrap) return;

  updateEventPageMeta(ev);
  injectEventJsonLd(ev);

  const extLinkHTML = ev.externalUrl
    ? `<a href="${escapeHtml(ev.externalUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" onclick="trackEventExternalLinkClick('${escapeHtml(String(ev.id))}')">公式サイトを見る ↗</a>`
    : '';

  wrap.innerHTML = `
    <div class="modal-header event-page-header">
      <h1 class="modal-title">${escapeHtml(ev.title)}</h1>
    </div>
    <div class="modal-body">
      <div class="modal-tags mb-2">
        <span class="tag ${categoryClass(ev.category)}">${categoryLabel(ev.category)}</span>
        <span class="tag ${feeClass(ev.feeType)}">${escapeHtml(ev.feeText || feeLabel(ev.feeType))}</span>
      </div>
      <div class="modal-detail-grid">
        <div class="modal-detail-item">
          <span class="modal-detail-label">日付</span>
          <span class="modal-detail-value">${formatEventDateDisplay(ev)}</span>
        </div>
        <div class="modal-detail-item">
          <span class="modal-detail-label">時間</span>
          <span class="modal-detail-value">${ev.startTime ? escapeHtml(formatTime(ev.startTime, ev.endTime)) : '終日'}</span>
        </div>
        <div class="modal-detail-item">
          <span class="modal-detail-label">場所</span>
          <span class="modal-detail-value">${escapeHtml(ev.location || '—')}</span>
        </div>
        <div class="modal-detail-item">
          <span class="modal-detail-label">キャンパス区分</span>
          <span class="modal-detail-value">${campusLabel(ev.campus)}</span>
        </div>
        <div class="modal-detail-item">
          <span class="modal-detail-label">主催団体</span>
          <span class="modal-detail-value">${escapeHtml(ev.organizer || '—')}</span>
        </div>
        <div class="modal-detail-item">
          <span class="modal-detail-label">対象者</span>
          <span class="modal-detail-value">${targetLabel(ev.target)}</span>
        </div>
        <div class="modal-detail-item">
          <span class="modal-detail-label">参加費</span>
          <span class="modal-detail-value">${escapeHtml(ev.feeText || feeLabel(ev.feeType))}</span>
        </div>
      </div>
      ${createReactionButtonsHTML(ev)}
      <div class="modal-share-actions">${createModalShareActionsHTML(ev)}</div>
      ${ev.description ? `
        <div>
          <p class="modal-desc-label">イベント説明</p>
          <p class="modal-desc-text">${escapeHtml(ev.description)}</p>
        </div>` : ''}
      <div class="modal-footer">
        <span class="modal-updated">${ev.lastUpdated ? `最終更新: ${escapeHtml(ev.lastUpdated)}` : ''}</span>
        ${extLinkHTML}
      </div>
    </div>`;

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

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const ev = id ? findPublishedEventById(id) : null;

  if (ev) {
    renderEventDetailPage(ev);
  } else {
    renderEventNotFound();
  }
});
