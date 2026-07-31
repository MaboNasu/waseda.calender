/**
 * script.js - Waseda Calendar メインスクリプト
 *
 * 機能:
 * - 本日のイベント表示
 * - 近日開催のイベント一覧表示
 * - カレンダー表示（PC:グリッド / スマホ:リスト）
 * - 絞り込み機能（大枠タブ：全部・学事日程・サークルイベント／詳細：カテゴリ・対象者・場所・参加費・キーワード）
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
  scope:    '',
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

/** イベントの日付表示。endDateがあれば範囲表示にする（例: 2026年7月2日（木）〜7月8日（水）） */
function formatEventDateDisplay(ev) {
  if (!isMultiDay(ev)) return formatDateDisplay(ev.date);
  const [ey, em, ed] = ev.endDate.split('-').map(Number);
  const endDate = new Date(ey, em - 1, ed);
  return `${formatDateDisplay(ev.date)}〜${em}月${ed}日（${WEEKDAY_JP[endDate.getDay()]}）`;
}

/** 複数日イベントの終了日（endDate未指定ならdateと同日） */
function getEventEnd(ev) {
  return ev.endDate || ev.date;
}

/** weeklyClassOnly:true が付いた学事日程（授業週・授業予備週など）は、
 *  日曜日は授業日ではないため、日曜日には表示しない（オープンキャンパス・早稲田祭など
 *  授業の有無と関係ない学事日程にはこのフラグを付けないので対象外になる） */
function isHiddenOnSunday(ev, dateStr) {
  if (!ev.weeklyClassOnly) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay() === 0;
}

/** dateStrがイベントの開催期間内（date〜endDate）かどうか */
function isEventOnDate(ev, dateStr) {
  if (isHiddenOnSunday(ev, dateStr)) return false;
  return ev.date <= dateStr && dateStr <= getEventEnd(ev);
}

/** 複数日（endDateがdateと異なる）イベントかどうか */
function isMultiDay(ev) {
  return getEventEnd(ev) !== ev.date;
}

/** YYYY-MM-DD → M/D（年を省いた簡易表示。期間バッジ等に使用） */
function formatShortDate(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}`;
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

/** イベントの大枠区分（scope）を取得。未指定の場合は「サークルイベント」扱い */
function getEventScope(ev) {
  return ev.scope === 'schedule' ? 'schedule' : 'circle';
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

/** 主催団体の表示。orgIdが設定されている場合は団体ページへのリンクにする */
function organizerHTML(ev) {
  const text = escapeHtml(ev.organizer || '—');
  if (!ev.orgId) return text;
  return `<a href="organizations.html?id=${encodeURIComponent(ev.orgId)}" class="organizer-link">${text}</a>`;
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
  if (key === 'free') return 'tag-free';
  if (key === 'paid') return 'tag-paid';
  return 'tag-unknown';
}

/** 公開イベントのみ取得（終了済み = 本日がendDateより後のイベントは通常表示から除外し、団体実績ページにのみ表示する） */
function getPublishedEvents() {
  const today = getTodayStr();
  return (typeof EVENTS !== 'undefined' ? EVENTS : []).filter(ev => ev.isPublished && getEventEnd(ev) >= today);
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
            <button class="reaction-btn" type="button" onclick="handleReactionClick('${type}', '${id}', this)">
              <span class="reaction-icon">${meta.icon}</span>
              <span>${meta.label}</span>
              <strong>${reactionCount(ev, type)}</strong>
            </button>`;
        }).join('')}
      </div>
      <p class="reaction-note">ボタンを押すとマイページのお気に入りに保存されます（Googleログインが必要です）。1イベントにつき選べるリアクションは1つです。</p>
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

async function handleReactionClick(type, eventId, btnEl) {
  if (!window.WC || !window.WC.auth) {
    alert('準備中です。少し待ってから再度お試しください。');
    return;
  }
  if (!window.WC.currentUser) {
    if (confirm('お気に入り登録にはログインが必要です。Googleでログインしますか？')) {
      window.WC.auth.signInWithGoogle().catch(() => {});
    }
    return;
  }

  if (btnEl) btnEl.disabled = true;
  try {
    const existing = await window.WC.auth.getFavorite(eventId);
    const isFavorited = !!(existing && existing.reactionType === type);
    await window.WC.auth.setFavorite(eventId, type, isFavorited);
    if (btnEl) {
      const panel = btnEl.closest('.reaction-buttons');
      if (panel) panel.querySelectorAll('.reaction-btn').forEach(b => b.classList.remove('active'));
      btnEl.classList.toggle('active', !isFavorited);
    }
  } catch (err) {
    alert('お気に入りの更新に失敗しました。時間をおいて再度お試しください。');
  } finally {
    if (btnEl) btnEl.disabled = false;
  }
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
    if (activeFilters.scope    && getEventScope(ev) !== activeFilters.scope) return false;
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
  activeFilters = { scope: activeFilters.scope, category: '', target: '', campus: '', feeType: '', keyword: '' };
  ['filter-category','filter-target','filter-campus','filter-fee'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const kw = document.getElementById('filter-keyword');
  if (kw) kw.value = '';
  renderAll();
}

/** 大枠フィルタ（全部・学事日程・サークルイベント）のタブ切替 */
function setupScopeToggle() {
  const buttons = document.querySelectorAll('.scope-btn');
  if (!buttons.length) return;

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilters.scope = btn.dataset.scope || '';
      renderAll();
    });
  });
}

/* ============================================================
   イベントカードのHTML生成
   ============================================================ */
function createEventCardHTML(ev, showDate = true) {
  const dateRow = showDate ? `
    <div class="event-info-row event-info-row-datetime">
      <span class="event-info-icon">📅</span>
      <span>${formatEventDateDisplay(ev)}</span>
    </div>` : '';

  const timeRow = ev.startTime ? `
    <div class="event-info-row event-info-row-datetime">
      <span class="event-info-icon">🕐</span>
      <span>${escapeHtml(formatTime(ev.startTime, ev.endTime))}</span>
    </div>` : '';

  const extLink = ev.externalUrl
    ? `<a href="${escapeHtml(ev.externalUrl)}" target="_blank" rel="noopener noreferrer" class="event-external-link">公式サイト ↗</a>`
    : '<span></span>';

  const id = escapeHtml(String(ev.id));
  const checked = selectedEventIds.has(String(ev.id)) ? 'checked' : '';

  return `
    <div class="event-card" data-id="${id}">
      <div class="event-card-accent"></div>
      <label class="event-card-select" title="カレンダー一括追加に選択">
        <input type="checkbox" ${checked} onclick="event.stopPropagation()" onchange="toggleEventSelection('${id}', this.checked)">
      </label>
      <div class="event-card-body">
        <div class="event-card-meta">
          <span class="tag ${categoryClass(ev.category)}">${categoryLabel(ev.category)}</span>
          <span class="tag ${feeClass(ev.feeType)}">${escapeHtml(ev.feeText || feeLabel(ev.feeType))}</span>
        </div>
        <h3 class="event-card-title">${escapeHtml(ev.title)}</h3>
        <div class="event-card-info">
          ${dateRow}
          ${timeRow}
          <div class="event-info-row event-info-row-location">
            <span class="event-info-icon">📍</span>
            <span>${escapeHtml(ev.location || campusLabel(ev.campus))}</span>
          </div>
          <div class="event-info-row event-info-row-organizer">
            <span class="event-info-icon">🏫</span>
            <span>${organizerHTML(ev)}</span>
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

/** イベントグリッドの後ろに「さらに表示」ボタンの入れ物を付けたHTMLを組み立てる */
function eventsGridWithShowMoreHTML(cardsHtml, sectionId) {
  return `<div class="events-grid">${cardsHtml}</div>
    <div class="show-more-wrap"><button type="button" class="show-more-btn" style="display:none;" onclick="toggleShowMore('${sectionId}')"></button></div>`;
}

/**
 * カレンダーまでの導線を近くするため、本日/近日開催のグリッドはデフォルトで1行分だけ表示し、
 * 2行目以降がある場合だけ「さらに表示」ボタンを出す。密度切替・ウィンドウ幅変更のたびに
 * 呼び直して1行の高さを再計算する。ユーザーが展開した後は、明示的に「閉じる」を押すまで
 * 展開状態を保つ（再描画や密度切替が起きるとリセットされる＝毎回デフォルトの折りたたみに戻る）。
 */
function collapseGridToOneRow(sectionEl) {
  if (!sectionEl) return;
  const grid = sectionEl.querySelector('.events-grid');
  const btn = sectionEl.querySelector('.show-more-btn');
  if (!grid || !btn) return;

  if (grid.dataset.expanded === 'true') return;

  grid.style.maxHeight = '';
  grid.style.overflow = '';
  const cards = Array.from(grid.children);
  if (cards.length === 0) { btn.style.display = 'none'; return; }

  const firstTop = cards[0].offsetTop;
  const firstRowCount = cards.filter(c => c.offsetTop === firstTop).length;

  if (firstRowCount >= cards.length) {
    // 全カードが1行に収まっている場合はボタン不要
    btn.style.display = 'none';
    return;
  }

  grid.style.maxHeight = `${cards[0].offsetHeight}px`;
  grid.style.overflow = 'hidden';
  btn.textContent = `さらに表示（他${cards.length - firstRowCount}件）`;
  btn.dataset.action = 'expand';
  btn.style.display = '';
}

/** 「さらに表示」/「閉じる」ボタンの切り替え */
function toggleShowMore(sectionId) {
  const sectionEl = document.getElementById(sectionId);
  if (!sectionEl) return;
  const grid = sectionEl.querySelector('.events-grid');
  const btn = sectionEl.querySelector('.show-more-btn');
  if (!grid || !btn) return;

  if (btn.dataset.action === 'expand') {
    grid.style.maxHeight = '';
    grid.style.overflow = '';
    grid.dataset.expanded = 'true';
    btn.textContent = '閉じる';
    btn.dataset.action = 'collapse';
  } else {
    grid.dataset.expanded = 'false';
    collapseGridToOneRow(sectionEl);
    sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ============================================================
   本日のイベント
   ============================================================ */
function renderTodayEvents() {
  const el = document.getElementById('today-events');
  if (!el) return;

  const today    = getTodayStr();
  const filtered = getFilteredEvents().filter(ev => isEventOnDate(ev, today));

  const countEl = document.getElementById('today-count');
  if (countEl) countEl.textContent = `${filtered.length}件`;

  el.innerHTML = filtered.length === 0
    ? emptyStateHTML('本日のイベントは0件です。')
    : eventsGridWithShowMoreHTML(filtered.map(ev => createEventCardHTML(ev, false)).join(''), 'today-events');
}

/* ============================================================
   近日開催のイベント
   ============================================================ */
/** 今日からちょうど1ヶ月後の日付文字列（近日開催に表示する範囲の上限に使う） */
function getOneMonthAheadStr() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return formatDateStr(d);
}

function renderUpcomingEvents() {
  const el = document.getElementById('upcoming-events');
  if (!el) return;

  const today         = getTodayStr();
  const oneMonthAhead = getOneMonthAheadStr();
  const filtered = getFilteredEvents()
    .filter(ev => (ev.date > today || isEventOnDate(ev, today)) && ev.date <= oneMonthAhead)
    .sort((a, b) => a.date.localeCompare(b.date));

  const countEl = document.getElementById('upcoming-count');
  if (countEl) countEl.textContent = `${filtered.length}件`;

  el.innerHTML = filtered.length === 0
    ? emptyStateHTML('近日開催のイベントは0件です。')
    : eventsGridWithShowMoreHTML(filtered.map(ev => createEventCardHTML(ev, true)).join(''), 'upcoming-events');
}

/* ============================================================
   カレンダー（PC: グリッド表示）
   ============================================================ */
function renderCalendarGrid() {
  const wrap = document.getElementById('calendar-grid');
  if (!wrap) return;

  const filtered = getFilteredEvents();
  const today    = getTodayStr();
  const firstDay = new Date(calendarYear, calendarMonth, 1);
  const lastDay  = new Date(calendarYear, calendarMonth + 1, 0);
  const startCol = (firstDay.getDay() + 6) % 7;
  const total    = lastDay.getDate();
  const remaining = (7 - ((startCol + total) % 7)) % 7;

  // 1. 前月末〜当月〜次月頭の全セルを作る（週ごとのバー計算のため、jsDowも事前に持たせる）
  const cells = [];
  for (let i = startCol; i > 0; i--) {
    const d = new Date(calendarYear, calendarMonth, 1 - i);
    cells.push({ dateStr: formatDateStr(d), dayNum: d.getDate(), otherMonth: true, jsDow: d.getDay() });
  }
  for (let d = 1; d <= total; d++) {
    const dateObj = new Date(calendarYear, calendarMonth, d);
    cells.push({ dateStr: formatDateStr(dateObj), dayNum: d, otherMonth: false, jsDow: dateObj.getDay() });
  }
  for (let d = 1; d <= remaining; d++) {
    const dateObj = new Date(calendarYear, calendarMonth + 1, d);
    cells.push({ dateStr: formatDateStr(dateObj), dayNum: d, otherMonth: true, jsDow: dateObj.getDay() });
  }

  // 2. 単日イベントと複数日イベントを分ける（複数日イベントは週単位のバーとして別途描画）
  const multiDayEvents = filtered.filter(isMultiDay);
  const singleDayByDate = {};
  filtered.filter(ev => !isMultiDay(ev)).forEach(ev => {
    if (isHiddenOnSunday(ev, ev.date)) return;
    if (!singleDayByDate[ev.date]) singleDayByDate[ev.date] = [];
    singleDayByDate[ev.date].push(ev);
  });

  const BAR_HEIGHT = 18; // px（1レーンあたりの高さ。style.cssの.event-barと合わせること）
  let html = '';

  // 3. 週（7日）ごとに描画
  for (let w = 0; w < cells.length; w += 7) {
    const week      = cells.slice(w, w + 7);
    const weekStart = week[0].dateStr;
    const weekEnd   = week[6].dateStr;

    // この週にかかる複数日イベントのバー区間を計算
    const bars = [];
    multiDayEvents.forEach(ev => {
      const evEnd = getEventEnd(ev);
      if (ev.date > weekEnd || evEnd < weekStart) return;
      const segStart = ev.date > weekStart ? ev.date : weekStart;
      const segEnd   = evEnd < weekEnd ? evEnd : weekEnd;
      let startCol2 = week.findIndex(c => c.dateStr === segStart);
      let endCol2   = week.findIndex(c => c.dateStr === segEnd);
      if (startCol2 === -1 || endCol2 === -1) return;

      // 学事日程（授業週等）は日曜日（列インデックス6）を非表示にする。日曜日だけの区間になった場合はバー自体を出さない
      if (endCol2 === 6 && isHiddenOnSunday(ev, week[6].dateStr)) endCol2 = 5;
      if (startCol2 > endCol2) return;

      bars.push({
        ev, startCol: startCol2, span: endCol2 - startCol2 + 1,
        continuesBefore: ev.date < weekStart,
        continuesAfter: evEnd > weekEnd
      });
    });

    // レーン割り当て（貪欲法。開始列が早い順に、重ならない最小のレーンへ）
    bars.sort((a, b) => a.startCol - b.startCol);
    const laneEndCols = [];
    bars.forEach(bar => {
      let lane = 0;
      while (lane < laneEndCols.length && laneEndCols[lane] >= bar.startCol) lane++;
      laneEndCols[lane] = bar.startCol + bar.span - 1;
      bar.lane = lane;
    });
    const maxLanes = laneEndCols.length;
    const dayEventsOffset = maxLanes > 0 ? `${maxLanes * BAR_HEIGHT + 6}px` : '';

    // 日セルのHTML
    const dayCellsHtml = week.map(cell => {
      if (cell.otherMonth) {
        return `<div class="calendar-day other-month"><span class="day-num">${cell.dayNum}</span></div>`;
      }
      const holiday  = getHolidayName(cell.dateStr);
      const isToday  = cell.dateStr === today;
      const dayEvs   = singleDayByDate[cell.dateStr] || [];
      const classes  = ['calendar-day', isToday ? 'today' : '', holiday ? 'holiday' : '', cell.jsDow === 0 ? 'sunday' : '', cell.jsDow === 6 ? 'saturday' : ''].filter(Boolean).join(' ');
      const holidayTitle = holiday ? ` title="${escapeHtml(holiday)}"` : '';
      const holidayMark  = holiday ? `<span class="holiday-mark" title="${escapeHtml(holiday)}">(祝)</span>` : '';

      const maxShow = 3;
      const chips   = dayEvs.slice(0, maxShow).map(ev =>
        `<div class="day-event-chip ${categoryClass(ev.category)}" onclick="openModal('${escapeHtml(String(ev.id))}')" title="${escapeHtml(ev.title)}">${escapeHtml(ev.title)}</div>`
      ).join('');
      const moreBtn = dayEvs.length > maxShow
        ? `<div class="day-more" onclick="showDayEvents('${cell.dateStr}')">他${dayEvs.length - maxShow}件</div>`
        : '';
      const dayEventsStyle = dayEventsOffset ? ` style="margin-top:${dayEventsOffset}"` : '';
      const dayNumClass = dayEvs.length > 0 ? 'day-num day-num-clickable' : 'day-num';
      const dayNumClick = dayEvs.length > 0 ? ` onclick="showDayEvents('${cell.dateStr}')"` : '';

      return `<div class="${classes}"${holidayTitle}>${holidayMark}<span class="${dayNumClass}"${dayNumClick}>${cell.dayNum}</span><div class="day-events"${dayEventsStyle}>${chips}${moreBtn}</div></div>`;
    }).join('');

    // 複数日イベントのバーHTML（週の7列に対する絶対配置オーバーレイ）
    const barsHtml = bars.map(bar => {
      const leftPct  = (bar.startCol / 7) * 100;
      const widthPct = (bar.span / 7) * 100;
      const topPx    = bar.lane * BAR_HEIGHT;
      const edgeClasses = [
        bar.continuesBefore ? 'bar-continues-before' : '',
        bar.continuesAfter ? 'bar-continues-after' : ''
      ].filter(Boolean).join(' ');
      return `<div class="event-bar ${categoryClass(bar.ev.category)} ${edgeClasses}" style="left:${leftPct}%;width:${widthPct}%;top:${topPx}px;" onclick="openModal('${escapeHtml(String(bar.ev.id))}')" title="${escapeHtml(bar.ev.title)}">${escapeHtml(bar.ev.title)}</div>`;
    }).join('');
    const weekBarsHtml = bars.length > 0 ? `<div class="week-bars">${barsHtml}</div>` : '';

    html += `<div class="calendar-week">${dayCellsHtml}${weekBarsHtml}</div>`;
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

  // 表示中が「今月」の場合のみ、今日より前の日付は一覧から省く
  // （スマホ横幅の都合でリスト表示になった時、過ぎた日付を延々スクロールしなくて済むように。
  //  前月以前に移動した時は、その月の内容をそのまま全部見られるようにする）
  const now = new Date();
  const isCurrentMonth = calendarYear === now.getFullYear() && calendarMonth === now.getMonth();

  // 複数日イベントも、その月にかかる日すべてに表示する（isEventOnDateで判定）
  const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = formatDateStr(new Date(calendarYear, calendarMonth, d));
    if (isCurrentMonth && dateStr < today) continue;
    const dayEvs = filtered.filter(ev => isEventOnDate(ev, dateStr));
    if (dayEvs.length > 0) evByDate[dateStr] = dayEvs;
  }

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

    const items = dayEvs.map(ev => {
      const rangeBadge = isMultiDay(ev)
        ? `<span class="cal-event-range-badge">${formatShortDate(ev.date)}〜${formatShortDate(ev.endDate)}</span>`
        : '';
      const timeText = ev.startTime ? escapeHtml(ev.startTime) : (isMultiDay(ev) ? '終日' : '—');
      return `
      <div class="cal-list-event-item" onclick="openModal('${escapeHtml(String(ev.id))}')">
        <span class="cal-event-time">${timeText}</span>
        <div>
          <div class="cal-event-title">${escapeHtml(ev.title)} ${rangeBadge}</div>
          <div class="cal-event-loc">${escapeHtml(ev.location || campusLabel(ev.campus))}</div>
        </div>
      </div>`;
    }).join('');

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
  const filtered  = getFilteredEvents().filter(ev => ev.date === dateStr && !isHiddenOnSunday(ev, dateStr));
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
  const shareActions = document.getElementById('modal-share-actions');
  if (shareActions) shareActions.innerHTML = '';
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
      <span class="modal-detail-value">${organizerHTML(ev)}</span>
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

  // カレンダー追加・シェア
  const shareActions = document.getElementById('modal-share-actions');
  if (shareActions) shareActions.innerHTML = createModalShareActionsHTML(ev);

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
   イベントの複数選択（一括カレンダー追加）
   ============================================================ */
const selectedEventIds = new Set();

function toggleEventSelection(eventId, checked) {
  const id = String(eventId);
  if (checked) selectedEventIds.add(id);
  else selectedEventIds.delete(id);
  renderSelectionBar();
}

function clearEventSelection() {
  selectedEventIds.clear();
  document.querySelectorAll('.event-card-select input[type="checkbox"]').forEach(cb => { cb.checked = false; });
  renderSelectionBar();
}

function renderSelectionBar() {
  const bar = document.getElementById('selection-bar');
  if (!bar) return;
  const count = selectedEventIds.size;
  if (count === 0) {
    bar.classList.remove('active');
    bar.innerHTML = '';
    return;
  }
  bar.classList.add('active');
  bar.innerHTML = `
    <span class="selection-bar-count">${count}件選択中</span>
    <button type="button" class="btn btn-enjy btn-sm" onclick="downloadIcsForSelectedEvents()">📅 選択したイベントをカレンダーに追加</button>
    <button type="button" class="btn btn-ghost btn-sm" onclick="clearEventSelection()">選択を解除</button>`;
}

/* ============================================================
   カレンダー追加（.ics ダウンロード）・SNSシェア
   ============================================================ */
function pad2(n) { return String(n).padStart(2, '0'); }

function addOneDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return formatDateStr(new Date(y, m - 1, d + 1));
}

function icsDateTime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!timeStr) return `${y}${pad2(m)}${pad2(d)}`;
  const [hh, mm] = timeStr.split(':').map(Number);
  return `${y}${pad2(m)}${pad2(d)}T${pad2(hh)}${pad2(mm)}00`;
}

function icsTimestampUTC() {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}

function escapeIcsText(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** イベント1件分のVEVENTブロックの行配列を作る */
function buildIcsVeventLines(ev) {
  let dtStartLine, dtEndLine;
  if (ev.startTime) {
    dtStartLine = `DTSTART;TZID=Asia/Tokyo:${icsDateTime(ev.date, ev.startTime)}`;
    dtEndLine   = `DTEND;TZID=Asia/Tokyo:${icsDateTime(ev.date, ev.endTime || ev.startTime)}`;
  } else {
    dtStartLine = `DTSTART;VALUE=DATE:${icsDateTime(ev.date)}`;
    dtEndLine   = `DTEND;VALUE=DATE:${icsDateTime(addOneDay(ev.date))}`;
  }

  return [
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(ev.id)}@wasedacalendar.com`,
    `DTSTAMP:${icsTimestampUTC()}`,
    dtStartLine,
    dtEndLine,
    `SUMMARY:${escapeIcsText(ev.title)}`,
    `DESCRIPTION:${escapeIcsText(ev.description || '')}`,
    `LOCATION:${escapeIcsText(ev.location || campusLabel(ev.campus))}`,
    'END:VEVENT'
  ];
}

/** イベント配列を1つの.icsファイルとしてダウンロード（Google/Apple/Outlookカレンダーに追加用） */
function downloadIcsForEvents(events, filename) {
  if (!events.length) return;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Waseda Calendar//JP',
    'CALSCALE:GREGORIAN',
    ...events.flatMap(buildIcsVeventLines),
    'END:VCALENDAR'
  ];

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** イベントを.icsファイルとしてダウンロード（Google/Apple/Outlookカレンダーに追加用） */
function downloadIcsForEvent(eventId) {
  const allEvents = typeof EVENTS !== 'undefined' ? EVENTS : [];
  const ev = allEvents.find(e => String(e.id) === String(eventId));
  if (!ev) return;
  downloadIcsForEvents([ev], `${ev.id}.ics`);
}

/** 選択中の複数イベントを1つの.icsファイルとしてダウンロード */
function downloadIcsForSelectedEvents() {
  const allEvents = typeof EVENTS !== 'undefined' ? EVENTS : [];
  const events = allEvents.filter(e => selectedEventIds.has(String(e.id)));
  if (!events.length) return;
  downloadIcsForEvents(events, `wasedacalendar-events-${events.length}.ics`);
}

/** Googleカレンダーの「予定作成」テンプレートURLを組み立てる（1クリック追加用） */
function buildGoogleCalendarUrl(ev) {
  const datesParam = ev.startTime
    ? `${icsDateTime(ev.date, ev.startTime)}/${icsDateTime(ev.date, ev.endTime || ev.startTime)}`
    : `${icsDateTime(ev.date)}/${icsDateTime(addOneDay(ev.date))}`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title || '',
    dates: datesParam,
    details: ev.description || '',
    location: ev.location || campusLabel(ev.campus),
    ctz: 'Asia/Tokyo'
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** イベント個別ページの絶対URL（SNSシェア・パーマリンクに使用） */
function buildEventPageUrl(ev) {
  return `https://wasedacalendar.com/event.html?id=${encodeURIComponent(ev.id)}`;
}

function shareEventOnLine(eventId) {
  const allEvents = typeof EVENTS !== 'undefined' ? EVENTS : [];
  const ev = allEvents.find(e => String(e.id) === String(eventId));
  if (!ev) return;
  const text = `${ev.title} | Waseda Calendar`;
  const url  = buildEventPageUrl(ev);
  window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}

function shareEventOnX(eventId) {
  const allEvents = typeof EVENTS !== 'undefined' ? EVENTS : [];
  const ev = allEvents.find(e => String(e.id) === String(eventId));
  if (!ev) return;
  const text = `${ev.title} | Waseda Calendar`;
  const url  = buildEventPageUrl(ev);
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer');
}

function createModalShareActionsHTML(ev) {
  const id = escapeHtml(String(ev.id));
  return `
    <a class="btn btn-ghost btn-sm" href="${escapeHtml(buildGoogleCalendarUrl(ev))}" target="_blank" rel="noopener noreferrer">📅 Googleカレンダーに追加</a>
    <button type="button" class="btn btn-ghost btn-sm" onclick="downloadIcsForEvent('${id}')">⬇️ カレンダーファイル(.ics)を保存</button>
    <a class="btn btn-ghost btn-sm" href="${escapeHtml(buildEventPageUrl(ev))}">🔗 個別ページを開く</a>
    <button type="button" class="btn btn-ghost btn-sm" onclick="generatePostImageForEvent('${id}')">🖼️ 投稿用画像を生成</button>
    <button type="button" class="btn btn-ghost btn-sm" onclick="shareEventOnLine('${id}')">LINEで共有</button>
    <button type="button" class="btn btn-ghost btn-sm" onclick="shareEventOnX('${id}')">Xで共有</button>`;
}

/* ============================================================
   構造化データ（schema.org/Event） SEO用
   ============================================================ */
/** キャンパスごとの所在地（早稲田大学公式サイト記載の住所。場所が定まらない区分は含めない） */
const CAMPUS_ADDRESS = {
  waseda:      { addressRegion: '東京都', addressLocality: '新宿区', streetAddress: '西早稲田1-6-1' },
  toyama:      { addressRegion: '東京都', addressLocality: '新宿区', streetAddress: '戸山1-24-1' },
  nishiwaseda: { addressRegion: '東京都', addressLocality: '新宿区', streetAddress: '大久保3-4-1' },
  tokorozawa:  { addressRegion: '埼玉県', addressLocality: '所沢市', streetAddress: '三ヶ島2-579-15' }
};

/**
 * schema.org/Event のJSON-LDを組み立てる。ホームページの一覧用と、イベント個別ページ用の
 * 両方から呼ばれる共有関数（pageUrlを省略するとホームページURLになる）。
 * 画面に表示していない・確認できない情報（不明な参加費を無料扱いにする等）は入れない。
 */
function buildEventJsonLd(ev, pageUrl) {
  const url = pageUrl || 'https://wasedacalendar.com/';
  const isOnline = ev.campus === 'online';
  const campusAddress = CAMPUS_ADDRESS[ev.campus];
  const isPerformance = ev.category === 'music' || ev.category === 'theater';

  const data = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: ev.title,
    url,
    startDate: ev.startTime ? `${ev.date}T${ev.startTime}:00+09:00` : ev.date,
    endDate: ev.endTime ? `${ev.date}T${ev.endTime}:00+09:00` : (ev.endDate || undefined),
    eventAttendanceMode: isOnline
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: isOnline
      ? { '@type': 'VirtualLocation', url: ev.externalUrl || url }
      : {
          '@type': 'Place',
          name: ev.location || campusLabel(ev.campus),
          address: campusAddress ? { '@type': 'PostalAddress', addressCountry: 'JP', ...campusAddress } : { '@type': 'PostalAddress', addressCountry: 'JP' }
        },
    image: ev.imageUrl || 'https://wasedacalendar.com/assets/og-image.png',
    description: ev.description || ev.title,
    organizer: {
      '@type': 'Organization',
      name: ev.organizer || 'Waseda Calendar',
      url: ev.externalUrl || undefined
    },
    performer: isPerformance
      ? { '@type': 'PerformingGroup', name: ev.organizer || 'Waseda Calendar' }
      : undefined
  };

  // 参加費が「無料」と明確に分かっている場合のみofferを載せる。有料・不明な場合は金額を推測しない
  // （offersを付けた上でpriceだけ空にすると、Search Consoleで「price」欠落として警告される）
  if (ev.feeType === 'free') {
    data.offers = {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'JPY',
      availability: 'https://schema.org/InStock',
      validFrom: ev.lastUpdated ? `${ev.lastUpdated}T00:00:00+09:00` : undefined,
      url
    };
  }

  return data;
}

/** 公開済み・本日以降のイベントをJSON-LDとして<head>に埋め込む（検索エンジン向け） */
function injectEventsJsonLd() {
  const upcoming = getPublishedEvents()
    .filter(ev => ev.date >= getTodayStr())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 20);

  let script = document.getElementById('events-jsonld');
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'events-jsonld';
    document.head.appendChild(script);
  }
  // map(buildEventJsonLd) だと map が渡す第2引数(index)がpageUrlに紛れ込むため、明示的に1引数で呼ぶ
  script.textContent = JSON.stringify(upcoming.map(ev => buildEventJsonLd(ev)));
}

/* ============================================================
   まとめて再描画
   ============================================================ */
/* ============================================================
   表示密度切り替え（大きめ／コンパクト）
   ============================================================ */
const DENSITY_STORAGE_KEY = 'wc-events-density';

/** セクションごと（本日のイベント/近日開催）に独立して密度設定を保存・復元する */
function getStoredDensity(sectionId) {
  try {
    const stored = localStorage.getItem(`${DENSITY_STORAGE_KEY}-${sectionId}`);
    // 旧バージョン（大きめ/コンパクトの2択）で保存された値を新しい3段階に読み替える
    if (stored === 'compact') return 'small';
    return stored || 'large';
  } catch (e) {
    return 'large';
  }
}

function setStoredDensity(sectionId, value) {
  try {
    localStorage.setItem(`${DENSITY_STORAGE_KEY}-${sectionId}`, value);
  } catch (e) {
    // localStorageが使えない環境（プライベートモード等）では保存をスキップ
  }
}

/** 指定セクション内の表示密度（大/中/小）だけを適用する（他セクションには影響しない） */
function applyDensity(sectionEl, density) {
  if (!sectionEl) return;
  sectionEl.querySelectorAll('.events-grid').forEach(grid => {
    grid.classList.toggle('density-medium', density === 'medium');
    grid.classList.toggle('density-small', density === 'small');
  });
  sectionEl.querySelectorAll('.density-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.density === density);
  });
}

function setupDensityToggle() {
  document.querySelectorAll('.density-toggle').forEach(toggle => {
    const sectionEl = toggle.closest('section');
    if (!sectionEl) return;
    toggle.querySelectorAll('.density-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setStoredDensity(sectionEl.id, btn.dataset.density);
        applyDensity(sectionEl, btn.dataset.density);
        // 密度が変わると1行の高さも変わるため、展開状態をリセットして1行分に折りたたみ直す
        const grid = sectionEl.querySelector('.events-grid');
        if (grid) grid.dataset.expanded = 'false';
        collapseGridToOneRow(sectionEl);
      });
    });
  });
}

function applyAllStoredDensities() {
  document.querySelectorAll('.density-toggle').forEach(toggle => {
    const sectionEl = toggle.closest('section');
    if (!sectionEl) return;
    applyDensity(sectionEl, getStoredDensity(sectionEl.id));
    // 密度クラスを当てた後（＝グリッドの実際のカードサイズが確定した後）でないと
    // 1行分の高さを正しく測れないため、必ずこの後で折りたたみを行う
    const grid = sectionEl.querySelector('.events-grid');
    if (grid) grid.dataset.expanded = 'false';
    collapseGridToOneRow(sectionEl);
  });
}

function renderAll() {
  renderTodayEvents();
  renderUpcomingEvents();
  renderCalendar();
  injectEventsJsonLd();
  applyAllStoredDensities();
  renderSelectionBar();
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
  setupScopeToggle();
  setupFilters();
  setupModal();
  setupDensityToggle();
  renderAll();

  // 画面幅が変わると1行に入るカード枚数（＝1行の高さ）も変わるため、折りたたみ中の
  // セクションだけ高さを測り直す（展開済みのセクションはそのまま維持する）
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      document.querySelectorAll('#today-events, #upcoming-events').forEach(collapseGridToOneRow);
    }, 200);
  });
});
