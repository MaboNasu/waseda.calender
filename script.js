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
   定数・初期値
   ============================================================ */
const WEEKDAY_JP  = ['日', '月', '火', '水', '木', '金', '土'];
const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const HOLIDAYS = {
  '2026-01-01': '元日',
  '2026-01-12': '成人の日',
  '2026-02-11': '建国記念の日',
  '2026-02-23': '天皇誕生日',
  '2026-03-20': '春分の日',
  '2026-04-29': '昭和の日',
  '2026-05-03': '憲法記念日',
  '2026-05-04': 'みどりの日',
  '2026-05-05': 'こどもの日',
  '2026-05-06': '振替休日',
  '2026-07-20': '海の日',
  '2026-08-11': '山の日',
  '2026-09-21': '敬老の日',
  '2026-09-22': '国民の休日',
  '2026-09-23': '秋分の日',
  '2026-10-12': 'スポーツの日',
  '2026-11-03': '文化の日',
  '2026-11-23': '勤労感謝の日'
};

function getHolidayName(dateStr) {
  return HOLIDAYS[dateStr] || '';
}

const REACTION_TYPES = {
  interested: { label: '気になる', icon: '☆' },
  wantToGo:   { label: '行きたい', icon: '↗' },
  going:      { label: '参加予定', icon: '✓' }
};

let calendarYear, calendarMonth;

let activeFilters = {
  category: '',
  target:   '',
  campus:   '',
  feeType:  '',
  keyword:  ''
};

/* ============================================================
   ユーティリティ
   ============================================================ */

/** 今日の日付文字列 YYYY-MM-DD */
function getTodayStr() {
  return formatDateStr(new Date());
}

/** Dateオブジェクト → YYYY-MM-DD */
function formatDateStr(d) {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD → 表示用（例: 2026年6月15日（日）） */
function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${y}年${m}月${d}日（${WEEKDAY_JP[date.getDay()]}）`;
}

/** 時間表示（HH:MM〜HH:MM） */
function formatTime(start, end) {
  if (!start) return '';
  if (!end)   return `${start}〜`;
  return `${start}〜${end}`;
}

/** カテゴリキー → 日本語 */
function categoryLabel(key) {
  return (typeof CATEGORY_LABELS !== 'undefined' && CATEGORY_LABELS[key]) || key || '—';
}

/** 対象者（配列 or 文字列）→ 日本語 */
function targetLabel(val) {
  if (!val || val.length === 0) return '—';
  const arr = Array.isArray(val) ? val : [val];
  return arr.map(t => (typeof TARGET_LABELS !== 'undefined' && TARGET_LABELS[t]) || t).join('・');
}

/** キャンパスキー → 日本語 */
function campusLabel(key) {
  return (typeof CAMPUS_LABELS !== 'undefined' && CAMPUS_LABELS[key]) || key || '—';
}

/** 参加費キー → 日本語 */
function feeLabel(key) {
  return (typeof FEE_LABELS !== 'undefined' && FEE_LABELS[key]) || key || '—';
}

/** カテゴリキー → CSSクラス */
function categoryClass(key) {
  const map = {
    sports: 'tag-sports', culture: 'tag-culture', music: 'tag-music',
    theater: 'tag-theater', lecture: 'tag-lecture', community: 'tag-community',
    other: 'tag-other'
  };
  return map[key] || 'tag-other';
}

/** 参加費キー → CSSクラス */
function feeClass(key) {
  return key === 'free' ? 'tag-free' : 'tag-paid';
}

/** 公開イベントのみ取得 */
function getPublishedEvents() {
  return (typeof EVENTS !== 'undefined' ? EVENTS : []).filter(ev => ev.isPublished);
}

/** reactions未定義でも0件として扱う */
function getEventReactions(ev) {
  const source = ev && ev.reactions ? ev.reactions : {};
  return {
    interested: Number(source.interested) || 0,
    wantToGo:   Number(source.wantToGo) || 0,
    going:      Number(source.going) || 0
  };
}

function reactionCount(ev, type) {
  const reactions = getEventReactions(ev);
  return reactions[type] || 0;
}

function reactionLabel(type) {
  return REACTION_TYPES[type] ? REACTION_TYPES[type].label : type;
}

function createReactionButtonsHTML(ev) {
  const id = escapeHtml(String(ev.id));
  return `
    <div class="reaction-panel" aria-label="リアクション">
      <p class="reaction-panel-label">リアクション</p>
      <div class="reaction-buttons">
        ${Object.keys(REACTION_TYPES).map(type => {
          const meta = REACTION_TYPES[type];
          return `
            <button class="reaction-btn" type="button" onclick="handleReactionClick('${type}', '${id}')">
              <span class="reaction-icon">${meta.icon}</span>
              <span>${meta.label}</span>
              <strong>${reactionCount(ev, type)}</strong>
            </button>`;
        }).join('')}
      </div>
      <p class="reaction-note">ログイン機能の実装後に利用できます。</p>
    </div>`;
}

function createReactionSummaryHTML(ev, activeType = '') {
  return `
    <div class="reaction-summary" aria-label="リアクション件数">
      ${Object.keys(REACTION_TYPES).map(type => {
        const meta = REACTION_TYPES[type];
        const activeClass = activeType === type ? ' active' : '';
        return `<span class="reaction-chip${activeClass}">${meta.label} ${reactionCount(ev, type)}</span>`;
      }).join('')}
    </div>`;
}

function handleReactionClick() {
  alert('この機能は準備中です。ログイン機能の実装後に利用できます。');
}

/** XSS防止エスケープ */
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
   フィルタリング
   ============================================================ */

/** EVENTSにフィルタを適用（isPublished:true のみ） */
function getFilteredEvents() {
  return getPublishedEvents().filter(ev => {
    if (activeFilters.category && ev.category !== activeFilters.category) return false;
    if (activeFilters.campus   && ev.campus   !== activeFilters.campus)   return false;
    if (activeFilters.feeType  && ev.feeType  !== activeFilters.feeType)  return false;
    if (activeFilters.target) {
      const targets = Array.isArray(ev.target) ? ev.target : [ev.target];
      if (!targets.includes(activeFilters.target)) return false;
    }
    if (activeFilters.keyword) {
      const kw       = activeFilters.keyword.toLowerCase();
      const haystack = `${ev.title} ${ev.organizer} ${ev.description}`.toLowerCase();
      if (!haystack.includes(kw)) return false;
    }
    return true;
  });
}

/** フィルターUIの値を読み取り activeFilters に反映 */
function readFilters() {
  activeFilters.category = document.getElementById('filter-category')?.value || '';
  activeFilters.target   = document.getElementById('filter-target')?.value   || '';
  activeFilters.campus   = document.getElementById('filter-campus')?.value   || '';
  activeFilters.feeType  = document.getElementById('filter-fee')?.value      || '';
  activeFilters.keyword  = document.getElementById('filter-keyword')?.value.trim() || '';
}

/** フィルターをリセット */
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
  const dateRow = showDate ? `
    <div class="event-info-row">
      <span class="event-info-icon">📅</span>
      <span>${formatDateDisplay(ev.date)}</span>
    </div>` : '';

  const extLink = ev.externalUrl
    ? `<a href="${escapeHtml(ev.externalUrl)}" target="_blank" rel="noopener noreferrer" class="event-external-link">公式サイト ↗</a>`
    : '<span></span>';

  return `
    <div class="event-card" data-id="${escapeHtml(ev.id)}">
      <div class="event-card-accent"></div>
      <div class="event-card-body">
        <div class="event-card-meta">
          <span class="tag ${categoryClass(ev.category)}">${categoryLabel(ev.category)}</span>
          <span class="tag ${feeClass(ev.feeType)}">${escapeHtml(ev.feeText || feeLabel(ev.feeType))}</span>
        </div>
        <h3 class="event-card-title">${escapeHtml(ev.title)}</h3>
        <div class="event-card-info">
          ${dateRow}
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
        ${createReactionSummaryHTML(ev)}
        ${ev.description ? `<p class="event-card-desc">${escapeHtml(ev.description)}</p>` : ''}
      </div>
      <div class="event-card-footer">
        ${extLink}
        <button class="btn-detail" onclick="openModal('${escapeHtml(String(ev.id))}')">詳細を見る</button>
      </div>
    </div>`;
}

/** 空状態のHTML */
function emptyStateHTML(message) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">📭</div>
      <p>${escapeHtml(message)}</p>
    </div>`;
}

/* ============================================================
   本日のイベント
   ============================================================ */
function renderTodayEvents() {
  const el = document.getElementById('today-events');
  if (!el) return;

  const today    = getTodayStr();
  const filtered = getFilteredEvents().filter(ev => ev.date === today);

  const countEl = document.getElementById('today-count');
  if (countEl) countEl.textContent = `${filtered.length}件`;

  el.innerHTML = filtered.length === 0
    ? emptyStateHTML('本日のイベントは0件です。')
    : `<div class="events-grid">${filtered.map(ev => createEventCardHTML(ev, false)).join('')}</div>`;
}

/* ============================================================
   近日開催のイベント
   ============================================================ */
function renderUpcomingEvents() {
  const el = document.getElementById('upcoming-events');
  if (!el) return;

  const today    = getTodayStr();
  const filtered = getFilteredEvents()
    .filter(ev => ev.date > today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const countEl = document.getElementById('upcoming-count');
  if (countEl) countEl.textContent = `${filtered.length}件`;

  el.innerHTML = filtered.length === 0
    ? emptyStateHTML('近日開催のイベントは0件です。')
    : `<div class="events-grid">${filtered.map(ev => createEventCardHTML(ev, true)).join('')}</div>`;
}

/* ============================================================
   リアクションランキング
   ============================================================ */
function createRankingCardHTML(ev, index, reactionType) {
  const count = reactionCount(ev, reactionType);
  const rankClass = index < 3 ? ` top-${index + 1}` : '';
  return `
    <article class="ranking-card">
      <div class="ranking-rank${rankClass}">${index + 1}</div>
      <div class="ranking-card-main">
        <div class="event-card-meta">
          <span class="tag ${categoryClass(ev.category)}">${categoryLabel(ev.category)}</span>
          <span class="ranking-count">${reactionLabel(reactionType)} ${count}</span>
        </div>
        <h3 class="ranking-title">${escapeHtml(ev.title)}</h3>
        <div class="ranking-meta">
          <span>📅 ${formatDateDisplay(ev.date)}</span>
          <span>🕐 ${escapeHtml(formatTime(ev.startTime, ev.endTime))}</span>
          <span>📍 ${escapeHtml(ev.location || campusLabel(ev.campus))}</span>
        </div>
        ${createReactionSummaryHTML(ev, reactionType)}
      </div>
      <button class="btn-detail" onclick="openModal('${escapeHtml(String(ev.id))}')">詳細を見る</button>
    </article>`;
}

function renderReactionRanking() {
  const wrap = document.getElementById('reaction-ranking');
  if (!wrap) return;

  const reactionSelect = document.getElementById('ranking-reaction');
  const sortSelect = document.getElementById('ranking-sort');
  const reactionType = reactionSelect?.value || 'interested';
  const sortType = sortSelect?.value || 'countDesc';
  const items = [...getPublishedEvents()];

  items.sort((a, b) => {
    if (sortType === 'dateAsc') return a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ja');
    if (sortType === 'dateDesc') return b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'ja');
    return reactionCount(b, reactionType) - reactionCount(a, reactionType)
      || a.date.localeCompare(b.date)
      || a.title.localeCompare(b.title, 'ja');
  });

  wrap.innerHTML = items.length === 0
    ? emptyStateHTML('ランキングに表示できるイベントはまだありません。')
    : items.map((ev, index) => createRankingCardHTML(ev, index, reactionType)).join('');
}

/* ============================================================
   カレンダー（PC: グリッド表示）
   ============================================================ */
function renderCalendarGrid() {
  const wrap = document.getElementById('calendar-grid');
  if (!wrap) return;

  const filtered  = getFilteredEvents();
  const evByDate  = {};
  filtered.forEach(ev => {
    if (!evByDate[ev.date]) evByDate[ev.date] = [];
    evByDate[ev.date].push(ev);
  });

  const today    = getTodayStr();
  const firstDay = new Date(calendarYear, calendarMonth, 1);
  const lastDay  = new Date(calendarYear, calendarMonth + 1, 0);
  const startCol = (firstDay.getDay() + 6) % 7;
  const total    = lastDay.getDate();

  let html = '';

  // 前月の空白
  for (let i = 0; i < startCol; i++) {
    const d = new Date(calendarYear, calendarMonth, -startCol + i + 1);
    html += `<div class="calendar-day other-month"><span class="day-num">${d.getDate()}</span></div>`;
  }

  // 当月
  for (let d = 1; d <= total; d++) {
    const dateStr  = `${calendarYear}-${String(calendarMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const holiday = getHolidayName(dateStr);
    const jsDow    = new Date(calendarYear, calendarMonth, d).getDay();
    const isToday  = dateStr === today;
    const dayEvs   = evByDate[dateStr] || [];
    const classes  = ['calendar-day', isToday ? 'today' : '', holiday ? 'holiday' : '', jsDow === 0 ? 'sunday' : '', jsDow === 6 ? 'saturday' : ''].filter(Boolean).join(' ');
    const holidayTitle = holiday ? ` title="${escapeHtml(holiday)}"` : '';
　　const holidayMark = holiday ? `<span class="holiday-mark" title="${escapeHtml(holiday)}">(祝)</span>` : '';

    const maxShow  = 3;
    const chips    = dayEvs.slice(0, maxShow).map(ev =>
      `<div class="day-event-chip" onclick="openModal('${escapeHtml(String(ev.id))}')" title="${escapeHtml(ev.title)}">${escapeHtml(ev.title)}</div>`
    ).join('');
    const moreBtn  = dayEvs.length > maxShow
      ? `<div class="day-more" onclick="showDayEvents('${dateStr}')">他${dayEvs.length - maxShow}件</div>`
      : '';

    html += `<div class="${classes}"${holidayTitle}>${holidayMark}<span class="day-num">${d}</span><div class="day-events">${chips}${moreBtn}</div></div>`;
  }

  // 次月の空白
  const remaining = (7 - ((startCol + total) % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    html += `<div class="calendar-day other-month"><span class="day-num">${d}</span></div>`;
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
  const today    = getTodayStr();
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
    const dateObj   = new Date(y, m - 1, d);
    const dow       = WEEKDAY_JP[dateObj.getDay()];
    const isToday   = dateStr === today;
    const dayEvs    = evByDate[dateStr];

    const items = dayEvs.map(ev => `
      <div class="cal-list-event-item" onclick="openModal('${escapeHtml(String(ev.id))}')">
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
        <div class="cal-list-events">${items}</div>
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
   特定日のイベント一覧（「他N件」クリック時）
   ============================================================ */
function showDayEvents(dateStr) {
  const filtered  = getFilteredEvents().filter(ev => ev.date === dateStr);
  const dateDisp  = formatDateDisplay(dateStr);
  if (filtered.length === 0) return;

  // 1件だけなら直接モーダルを開く
  if (filtered.length === 1) {
    openModal(filtered[0].id);
    return;
  }

  // 複数件: 一覧リストをモーダルに表示
  const listHTML = filtered.map(ev =>
    `<div style="padding:0.6rem 0;border-bottom:1px solid #eee;cursor:pointer;"
       onclick="openModal('${escapeHtml(String(ev.id))}')">
      <strong>${escapeHtml(ev.title)}</strong>
      <div style="font-size:0.8rem;color:#6B7280;">${escapeHtml(formatTime(ev.startTime, ev.endTime))} ／ ${escapeHtml(ev.location || campusLabel(ev.campus))}</div>
    </div>`
  ).join('');

  document.getElementById('modal-title').textContent = `${dateDisp} のイベント`;
  document.getElementById('modal-tags').innerHTML    = '';
  document.getElementById('modal-detail-content').innerHTML = listHTML;
  const reactions = document.getElementById('modal-reactions');
  if (reactions) reactions.innerHTML = '';
  document.getElementById('modal-desc-section').style.display  = 'none';
  document.getElementById('modal-footer-section').style.display = 'none';
  document.getElementById('event-modal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

/* ============================================================
   モーダル（イベント詳細）
   ============================================================ */
function openModal(eventId) {
  const allEvents = typeof EVENTS !== 'undefined' ? EVENTS : [];
  // String() で統一比較（HTML onclick から渡ると常に文字列になるため）
  const ev = allEvents.find(e => String(e.id) === String(eventId));
  if (!ev) return;

  document.getElementById('modal-title').textContent = ev.title;

  // タグ
  document.getElementById('modal-tags').innerHTML = `
    <span class="tag ${categoryClass(ev.category)}">${categoryLabel(ev.category)}</span>
    <span class="tag ${feeClass(ev.feeType)}">${escapeHtml(ev.feeText || feeLabel(ev.feeType))}</span>`;

  // 詳細グリッド
  document.getElementById('modal-detail-content').innerHTML = `
    <div class="modal-detail-item">
      <span class="modal-detail-label">日付</span>
      <span class="modal-detail-value">${formatDateDisplay(ev.date)}</span>
    </div>
    <div class="modal-detail-item">
      <span class="modal-detail-label">時間</span>
      <span class="modal-detail-value">${escapeHtml(formatTime(ev.startTime, ev.endTime))}</span>
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
    </div>`;

  const reactions = document.getElementById('modal-reactions');
  if (reactions) reactions.innerHTML = createReactionButtonsHTML(ev);

  // 説明
  const descSection = document.getElementById('modal-desc-section');
  descSection.style.display = ev.description ? '' : 'none';
  document.getElementById('modal-desc-text').textContent = ev.description || '';

  // フッター（外部リンク・最終更新）
  const footerSection = document.getElementById('modal-footer-section');
  footerSection.style.display = '';
  document.getElementById('modal-updated').textContent = ev.lastUpdated ? `最終更新: ${ev.lastUpdated}` : '';
  const extLink = document.getElementById('modal-ext-link');
  if (ev.externalUrl) {
    extLink.href           = ev.externalUrl;
    extLink.style.display  = '';
    extLink.textContent    = '公式サイトを見る ↗';
  } else {
    extLink.style.display  = 'none';
  }

  document.getElementById('event-modal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

/** モーダルを閉じる */
function closeModal() {
  document.getElementById('event-modal').classList.remove('active');
  document.body.style.overflow = '';
  document.getElementById('modal-desc-section').style.display    = '';
  document.getElementById('modal-footer-section').style.display  = '';
}

/* ============================================================
   まとめて再描画
   ============================================================ */
function renderAll() {
  renderTodayEvents();
  renderUpcomingEvents();
  renderReactionRanking();
  renderCalendar();
}

/* ============================================================
   掲載依頼フォーム: 問い合わせ種別による動的表示
   ============================================================ */
function setupContactForm() {
  const typeSelect  = document.getElementById('contact-type');
  const eventFields = document.getElementById('event-request-fields');
  if (!typeSelect || !eventFields) return;

  typeSelect.addEventListener('change', () => {
    if (typeSelect.value === 'event-request') {
      eventFields.classList.add('show');
    } else {
      eventFields.classList.remove('show');
    }
  });

  // フォーム送信（現時点では送信処理なし）
  const form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      alert('お問い合わせありがとうございます。\n現在、フォームの送信機能は準備中です。\nメール等でお問い合わせください。');
    });
  }
}

/* ============================================================
   スムーズスクロール
   ============================================================ */
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
  document.getElementById('mobile-nav')?.classList.remove('open');
}

/* ============================================================
   ハンバーガーメニュー
   ============================================================ */
function setupHamburger() {
  const btn = document.getElementById('hamburger-btn');
  const nav = document.getElementById('mobile-nav');
  if (!btn || !nav) return;

  btn.addEventListener('click', () => { nav.classList.toggle('open'); });

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
  const applyBtn    = document.getElementById('filter-apply');
  const resetBtn    = document.getElementById('filter-reset');
  const keywordInput = document.getElementById('filter-keyword');

  if (applyBtn)     applyBtn.addEventListener('click', () => { readFilters(); renderAll(); });
  if (resetBtn)     resetBtn.addEventListener('click', resetFilters);
  if (keywordInput) keywordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { readFilters(); renderAll(); }
  });
}

function setupRankingControls() {
  const reactionSelect = document.getElementById('ranking-reaction');
  const sortSelect = document.getElementById('ranking-sort');
  if (reactionSelect) reactionSelect.addEventListener('change', renderReactionRanking);
  if (sortSelect) sortSelect.addEventListener('change', renderReactionRanking);
}

/* ============================================================
   モーダル: オーバーレイクリック / Escで閉じる
   ============================================================ */
function setupModal() {
  const overlay = document.getElementById('event-modal');
  if (!overlay) return;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

/* ============================================================
   初期化
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const now      = new Date();
  calendarYear   = now.getFullYear();
  calendarMonth  = now.getMonth();

  setupHamburger();
  setupFilters();
  setupRankingControls();
  setupModal();
  setupContactForm();
  renderAll();
});
