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

function renderEventDetailPage(ev) {
  const wrap = document.getElementById('event-detail');
  if (!wrap) return;

  document.title = `${ev.title} – Waseda Calendar`;
  const titleEl = document.getElementById('event-page-title');
  if (titleEl) titleEl.textContent = `${ev.title} – Waseda Calendar`;

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
