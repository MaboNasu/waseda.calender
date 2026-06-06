/**
 * script.js - Wase Calendar メインスクリプト
 *
 * 機能:
 * - 本日のイベント表示
 * - 近日開催のイベント一覧表示
 * - カレンダー表示（PC:グリッド / スマホ:リスト）
 * - 絞り込み機能（カテゴリ・対象者・場所・参加費・キーワード）
 * - イベント詳細モーダル
 * - 掲載依頼フォームの動的切替
 * - ハンバーガーメニュー
 */

/* ============================================================
   定数・設定
   ============================================================ */
const WEEKDAY_JP = ['日', '月', '火', '水', '木', '金', '土'];
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月',
                     '7月', '8月', '9月', '10月', '11月', '12月'];

// カレンダー表示用状態
let calendarYear, calendarMonth;

// 絞り込み状態
let activeFilters = {
  category: '',
  target: '',
  campus: '',
  feeType: '',
  keyword: ''
};

/* ============================================================
   ユーティリティ
   ============================================================ */

/** 今日の日付文字列 YYYY-MM-DD */
function getTodayStr() {
  const d = new Date();
  return formatDateStr(d);
}

/** Dateオブジェクト → YYYY-MM-DD */
function formatDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD → 表示用 (例: 2025年6月15日（日）) */
function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dow = WEEKDAY_JP[date.getDay()];
  return `${y}年${m}月${d}日（${dow}）`;
}

/** 時間表示 (HH:MM〜HH:MM or HH:MM〜) */
function formatTime(start, end) {
  if (!start) return '';
  if (!end) return `${start}〜`;
  return `${start}〜${end}`;
}

/** カテゴリキー → 日本語ラベル */
function categoryLabel(key) {
  return (typeof CATEGORY_LABELS !== 'undefined' && CATEGORY_LABELS[key]) || key || '—';
}

/** 対象者配列 → 日本語ラベル文字列 */
function targetLabel(arr) {
  if (!arr || arr.length === 0) return '—';
  return arr.map(t => (typeof TARGET_LABELS !== 'undefined' && TARGET_LABELS[t]) || t).join('・');
}

/** キャンパスキー → 日本語ラベル */
function campusLabel(key) {
  return (typeof CAMPUS_LABELS !== 'undefined' && CAMPUS_LABELS[key]) || key || '—';
}

/** 参加費キー → 日本語ラベル */
function feeLabel(key) {
  return (typeof FEE_LABELS !== 'undefined' && FEE_LABELS[key]) || key || '—';
}

/** カテゴリキー → CSSクラス名 */
function categoryClass(key) {
  const map = {
    sports: 'tag-sports', culture: 'tag-culture', music: 'tag-music',
    theater: 'tag-theater', lecture: 'tag-lecture', community: 'tag-community',
    other: 'tag-other'
  };
  return map[key] || 'tag-other';
}

/** 参加費キー → CSSクラス名 */
function feeClass(key) {
  return key === 'free' ? 'tag-free' : 'tag-paid';
}

/* ============================================================
   フィルタリング
   ============================================================ */

/** EVENTSにフィルタを適用し、isPublished=trueのみ返す */
function getFilteredEvents() {
  const today = getTodayStr();
  return (typeof EVENTS !== 'undefined' ? EVENTS : []).filter(ev => {
    if (!ev.isPublished) return false;
    if (activeFilters.category && ev.category !== activeFilters.category) return false;
    if (activeFilters.campus   && ev.campus   !== activeFilters.campus)   return false;
    if (activeFilters.feeType  && ev.feeType  !== activeFilters.feeType)  return false;
    if (activeFilters.target) {
      const targets = Array.isArray(ev.target) ? ev.target : [ev.target];
      if (!targets.includes(activeFilters.target)) return false;
    }
    if (activeFilters.keyword) {
      const kw = activeFilters.keyword.toLowerCase();
      const haystack = `${ev.title} ${ev.organizer} ${ev.description}`.toLowerCase();
      if (!haystack.includes(kw)) return false;
    }
    return true;
  });
}

/** 絞り込みUIの値を読み取り activeFilters に反映 */
function readFilters() {
  activeFilters.category = document.getElementById('filter-category')?.value || '';
  activeFilters.target   = document.getElementById('filter-target')?.value   || '';
  activeFilters.campus   = document.getElementById('filter-campus')?.value   || '';
  activeFilters.feeType  = document.getElementById('filter-fee')?.value      || '';
  activeFilters.keyword  = document.getElementById('filter-keyword')?.value.trim() || '';
}

/** 絞り込みリセット */
function resetFilters() {
  activeFilters = { category: '', target: '', campus: '', feeType: '', keyword: '' };
  ['filter-category','filter-target','filter-campus','filter-fee'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const kw = document.getElementById('filter-keyword');
  if (kw) kw.value = '';
  renderAll();
}

/* ============================================================
   イベントカードのHTML生成
   ============================================================ */
function createEventCardHTML(ev, showDate = true) {
  const dateStr = showDate ? `
    <div class="event-info-row">
      <span class="event-info-icon">📅</span>
      <span>${formatDateDisplay(ev.date)}</span>
    </div>` : '';
  const extLink = ev.externalUrl ? `
    <a href="${escapeHtml(ev.externalUrl)}" target="_blank" rel="noopener noreferrer" class="event-external-link">
      公式サイト ↗
    </a>` : '<span></span>';

  return `
    <div class="event-card" data-id="${escapeHtml(ev.id)}">
      <div class="event-card-accent"></div>
      <div class="event-card-body">
        <div class="event-card-meta">
          <span class="tag ${categoryClass(ev.category)}">${categoryLabel(ev.category)}</span>
          <span class="tag ${feeClass(ev.feeType)}">${ev.feeText || feeLabel(ev.feeType)}</span>
        </div>
        <h3 class="event-card-title">${escapeHtml(ev.title)}</h3>
        <div class="event-card-info">
          ${dateStr}
          <div class="event-info-row">
            <span class="event-info-icon">🕐</span>
            <span>${escapeHtml(formatTime(ev.startTime, ev.endTime))}</span>
          </div>
          <div class="event-info-row">
            <span class="event-info-icon">📍</span>
            <span>${escapeHtml(ev.location || campusLabel(ev.campus))}</span>
          </div>
          <div class="event-info-row">
            <span class="event-info-icon">🏫</span>
            <span>${escapeHtml(ev.organizer || '—')}</span>
          </div>
        </div>
        ${ev.description ? `<p class="event-card-desc">${escapeHtml(ev.description)}</p>` : ''}
      </div>
      <div class="event-card-footer">
        ${extLink}
        <button class="btn-detail" onclick="openModal('${escapeHtml(ev.id)}')">詳細を見る</button>
      </div>
    </div>
  `;
}

/** 空状態HTML */
function emptyStateHTML(message) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">📭</div>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

/** XSS防止用エスケープ */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ============================================================
   本日のイベント
   ============================================================ */
function renderTodayEvents() {
  const el = document.getElementById('today-events');
  if (!el) return;
  const today = getTodayStr();
  const filtered = getFilteredEvents().filter(ev => ev.date === today);

  const countEl = document.getElementById('today-count');
  if (countEl) countEl.textContent = `${filtered.length}件`;

  if (filtered.length === 0) {
    el.innerHTML = emptyStateHTML('本日のイベントは0件です。');
    return;
  }
  el.innerHTML = `<div class="events-grid">${filtered.map(ev => createEventCardHTML(ev, false)).join('')}</div>`;
}

/* ============================================================
   近日開催のイベント
   ============================================================ */
function renderUpcomingEvents() {
  const el = document.getElementById('upcoming-events');
  if (!el) return;
  const today = getTodayStr();
  const filtered = getFilteredEvents()
    .filter(ev => ev.date > today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const countEl = document.getElementById('upcoming-count');
  if (countEl) countEl.textContent = `${filtered.length}件`;

  if (filtered.length === 0) {
    el.innerHTML = emptyStateHTML('近日開催のイベントは0件です。');
    return;
  }
  el.innerHTML = `<div class="events-grid">${filtered.map(ev => createEventCardHTML(ev, true)).join('')}</div>`;
}

/* ============================================================
   カレンダー（PC: グリッド表示）
   ============================================================ */
function renderCalendarGrid() {
  const wrap = document.getElementById('calendar-grid');
  if (!wrap) return;
  const filtered = getFilteredEvents();

  // その月のイベントをdateでインデックス
  const evByDate = {};
  filtered.forEach(ev => {
    if (!evByDate[ev.date]) evByDate[ev.date] = [];
    evByDate[ev.date].push(ev);
  });

  const today = getTodayStr();
  const firstDay = new Date(calendarYear, calendarMonth, 1);
  const lastDay  = new Date(calendarYear, calendarMonth + 1, 0);
  const startDow = firstDay.getDay(); // 0=日
  const totalDays = lastDay.getDate();

  let html = '';
  let dayCount = 0;

  // 前月の埋め
  for (let i = 0; i < startDow; i++) {
    const prevDate = new Date(calendarYear, calendarMonth, -startDow + i + 1);
    html += `<div class="calendar-day other-month">
      <span class="day-num">${prevDate.getDate()}</span>
    </div>`;
    dayCount++;
  }

  // 当月
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${calendarYear}-${String(calendarMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow = (startDow + d - 1) % 7;
    const isToday = dateStr === today;
    const dayEvents = evByDate[dateStr] || [];
    const classes = [
      'calendar-day',
      isToday ? 'today' : '',
      dow === 0 ? 'sunday' : '',
      dow === 6 ? 'saturday' : ''
    ].filter(Boolean).join(' ');

    const maxShow = 3;
    const chips = dayEvents.slice(0, maxShow).map(ev =>
      `<div class="day-event-chip" onclick="openModal('${escapeHtml(ev.id)}')" title="${escapeHtml(ev.title)}">${escapeHtml(ev.title)}</div>`
    ).join('');
    const moreBtn = dayEvents.length > maxShow
      ? `<div class="day-more" onclick="showDayEvents('${dateStr}')">他${dayEvents.length - maxShow}件</div>`
      : '';

    html += `
      <div class="${classes}">
        <span class="day-num">${d}</span>
        <div class="day-events">${chips}${moreBtn}</div>
      </div>`;
    dayCount++;
  }

  // 次月の埋め
  const remaining = (7 - (dayCount % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    html += `<div class="calendar-day other-month">
      <span class="day-num">${d}</span>
    </div>`;
  }

  wrap.innerHTML = html;
}

/* ============================================================
   カレンダー（スマホ: リスト表示）
   ============================================================ */
function renderCalendarList() {
  const wrap = document.getElementById('calendar-list');
  if (!wrap) return;
  const filtered = getFilteredEvents();

  const today = getTodayStr();
  const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();

  // イベントのある日のみ表示 + 空の場合はメッセージ
  const evByDate = {};
  filtered.forEach(ev => {
    const [y, m] = ev.date.split('-').map(Number);
    if (y === calendarYear && (m - 1) === calendarMonth) {
      if (!evByDate[ev.date]) evByDate[ev.date] = [];
      evByDate[ev.date].push(ev);
    }
  });

  const dates = Object.keys(evByDate).sort();

  if (dates.length === 0) {
    wrap.innerHTML = `<div class="cal-list-month-empty">この月のイベントは0件です。</div>`;
    return;
  }

  let html = '';
  dates.forEach(dateStr => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dow = WEEKDAY_JP[dateObj.getDay()];
    const isToday = dateStr === today;
    const dayEvs = evByDate[dateStr] || [];

    const evItems = dayEvs.map(ev => `
      <div class="cal-list-event-item" onclick="openModal('${escapeHtml(ev.id)}')">
        <span class="cal-event-time">${escapeHtml(ev.startTime || '—')}</span>
        <div>
          <div class="cal-event-title">${escapeHtml(ev.title)}</div>
          <div class="cal-event-loc">${escapeHtml(ev.location || campusLabel(ev.campus))}</div>
        </div>
      </div>`).join('');

    html += `
      <div class="cal-list-day ${isToday ? 'today' : ''} has-events">
        <div class="cal-list-day-header">
          <div class="cal-list-date-circle">
            <span class="cal-date-num">${d}</span>
            <span class="cal-date-dow">${dow}</span>
          </div>
          <span class="day-label">${m}月${d}日（${dow}）</span>
          <span class="cal-event-count">${dayEvs.length}件</span>
        </div>
        <div class="cal-list-events">${evItems}</div>
      </div>`;
  });
  wrap.innerHTML = html;
}

/* ============================================================
   カレンダーナビゲーション
   ============================================================ */
function updateCalendarTitle() {
  const el = document.getElementById('calendar-title');
  if (el) el.textContent = `${calendarYear}年 ${MONTH_NAMES[calendarMonth]}`;
}
function prevMonth() {
  calendarMonth--;
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
  renderCalendar();
}
function nextMonth() {
  calendarMonth++;
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  renderCalendar();
}
function renderCalendar() {
  updateCalendarTitle();
  renderCalendarGrid();
  renderCalendarList();
}

/* ============================================================
   特定日のイベント一覧（カレンダー「他N件」クリック）
   ============================================================ */
function showDayEvents(dateStr) {
  const filtered = getFilteredEvents().filter(ev => ev.date === dateStr);
  const dateDisp = formatDateDisplay(dateStr);
  if (filtered.length === 0) return;

  // 最初のイベントのモーダルを開く（複数の場合は一覧表示）
  if (filtered.length === 1) {
    openModal(filtered[0].id);
    return;
  }
  // 複数：簡易一覧モーダル
  const listHTML = filtered.map(ev =>
    `<div style="padding:0.6rem 0;border-bottom:1px solid #eee;cursor:pointer"
       onclick="openModal('${escapeHtml(ev.id)}')">
      <strong>${escapeHtml(ev.title)}</strong>
      <div style="font-size:0.8rem;color:#6B7280;">${escapeHtml(formatTime(ev.startTime, ev.endTime))} ／ ${escapeHtml(ev.location || campusLabel(ev.campus))}</div>
    </div>`
  ).join('');

  document.getElementById('modal-title').textContent = `${dateDisp} のイベント`;
  document.getElementById('modal-tags').innerHTML = '';
  document.getElementById('modal-detail-content').innerHTML = listHTML;
  document.getElementById('modal-desc-section').style.display = 'none';
  document.getElementById('modal-footer-section').style.display = 'none';
  document.getElementById('event-modal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

/* ============================================================
   モーダル（イベント詳細）
   ============================================================ */
function openModal(eventId) {
  const allEvents = typeof EVENTS !== 'undefined' ? EVENTS : [];
  // String()で統一比較（HTML onclick属性から渡ると常に文字列になるため）
  const ev = allEvents.find(e => String(e.id) === String(eventId));
  if (!ev) return;

  document.getElementById('modal-title').textContent = ev.title;

  // タグ
  const tagsHTML = `
    <span class="tag ${categoryClass(ev.category)}">${categoryLabel(ev.category)}</span>
    <span class="tag ${feeClass(ev.feeType)}">${ev.feeText || feeLabel(ev.feeType)}</span>
  `;
  document.getElementById('modal-tags').innerHTML = tagsHTML;

  // 詳細グリッド
  document.getElementById('modal-detail-content').innerHTML = `
    <div class="modal-detail-item">
      <span class="modal-detail-label">日付</span>
      <span class="modal-detail-value">${formatDateDisplay(ev.date)}</span>
    </div>
    <div class="modal-detail-item">
      <span class="modal-detail-label">時間</span>
      <span class="modal-detail-value">${formatTime(ev.startTime, ev.endTime)}</span>
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
  `;

  // 説明
  const descSection = document.getElementById('modal-desc-section');
  descSection.style.display = ev.description ? '' : 'none';
  document.getElementById('modal-desc-text').textContent = ev.description || '';

  // フッター
  const footerSection = document.getElementById('modal-footer-section');
  footerSection.style.display = '';
  document.getElementById('modal-updated').textContent = ev.lastUpdated ? `最終更新: ${ev.lastUpdated}` : '';
  const extLink = document.getElementById('modal-ext-link');
  if (ev.externalUrl) {
    extLink.href = ev.externalUrl;
    extLink.style.display = '';
    extLink.textContent = '公式サイトを見る ↗';
  } else {
    extLink.style.display = 'none';
  }

  document.getElementById('event-modal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('event-modal').classList.remove('active');
  document.body.style.overflow = '';
  // モーダルフッター・説明欄を元に戻す
  document.getElementById('modal-desc-section').style.display = '';
  document.getElementById('modal-footer-section').style.display = '';
}

/* ============================================================
   まとめて再描画
   ============================================================ */
function renderAll() {
  renderTodayEvents();
  renderUpcomingEvents();
  renderCalendar();
}

/* ============================================================
   掲載依頼フォーム: 問い合わせ種別による動的表示
   ============================================================ */
function setupContactForm() {
  const typeSelect = document.getElementById('contact-type');
  const eventFields = document.getElementById('event-request-fields');
  if (!typeSelect || !eventFields) return;

  typeSelect.addEventListener('change', () => {
    if (typeSelect.value === 'event-request') {
      eventFields.classList.add('show');
    } else {
      eventFields.classList.remove('show');
    }
  });

  // 送信ボタン (現時点では実際の送信は行わない)
  const form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      alert('お問い合わせありがとうございます。\n現在、フォームの送信機能は準備中です。\nメール等でお問い合わせください。');
    });
  }
}

/* ============================================================
   スムーズスクロール（ヘッダーナビ・CTA）
   ============================================================ */
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
  // モバイルナビを閉じる
  document.getElementById('mobile-nav')?.classList.remove('open');
}

/* ============================================================
   ハンバーガーメニュー
   ============================================================ */
function setupHamburger() {
  const btn = document.getElementById('hamburger-btn');
  const nav = document.getElementById('mobile-nav');
  if (!btn || !nav) return;

  btn.addEventListener('click', () => {
    nav.classList.toggle('open');
  });
  // 外側クリックで閉じる
  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !nav.contains(e.target)) {
      nav.classList.remove('open');
    }
  });
}

/* ============================================================
   絞り込みイベントリスナー
   ============================================================ */
function setupFilters() {
  const applyBtn = document.getElementById('filter-apply');
  const resetBtn = document.getElementById('filter-reset');
  const keywordInput = document.getElementById('filter-keyword');

  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      readFilters();
      renderAll();
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', resetFilters);
  }
  // キーワードはEnterキーでも適用
  if (keywordInput) {
    keywordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        readFilters();
        renderAll();
      }
    });
  }
}

/* ============================================================
   モーダルのオーバーレイクリックで閉じる
   ============================================================ */
function setupModal() {
  const overlay = document.getElementById('event-modal');
  if (!overlay) return;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  // Escキーで閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

/* ============================================================
   初期化
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // カレンダーの初期月 = 今月
  const now = new Date();
  calendarYear  = now.getFullYear();
  calendarMonth = now.getMonth();

  // 各機能セットアップ
  setupHamburger();
  setupFilters();
  setupModal();
  setupContactForm();

  // 初回描画
  renderAll();
});
