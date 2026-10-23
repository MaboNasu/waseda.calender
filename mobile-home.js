/**
 * mobile-home.js — Waseda Calendar スマホ版トップ v2（週カレンダー＋連続アジェンダ）
 *
 * 設計: Claude × ChatGPT 設計会議（2026-10-23）で確定した仕様。詳細はプロジェクト文書
 * 「mobile-v2-final-spec.md」を参照。
 *
 * - トップページ・768px以下・v2有効時だけ body.mh-active を付け、専用コンテナ #mh-root に描画する。
 *   既存の今日/7日間/カレンダーはCSSで隠すだけでDOMも関数も触らない（既存関数を上書きしない）。
 * - 既存の描画（renderAll）の完了は 'wc:rendered' で受け取り、自分では renderAll を呼ばない
 *   （scope切替だけは共有状態なので renderAll を呼ぶ。その結果の wc:rendered で再描画する）。
 * - 判定ロジックは MH_CORE（DOM非依存の純粋関数）にまとめ、Node から require してテストする
 *   （scripts/check-home-sections.js）。
 */
(function (root) {
  'use strict';

  /* =========================================================
     定数
     ========================================================= */
  const MH_CONST = {
    INITIAL_DAYS: 30,          // 初回に描画する日数（今日から）。先はスクロールで追加する
    EXTEND_DAYS: 30,           // 末尾に達したときに追加する日数
    INLINE_LIMIT: 5,           // 1日のうち最初に見せる件数
    INLINE_EXPAND_MAX: 8,      // この件数まではその場で展開。これを超えたら日別画面へ
    SCROLL_LOCK_MS: 800,       // プログラムでスクロールしている間、自動追従を止める時間
    SEARCH_DEBOUNCE_MS: 500,
    MAX_BADGE: 9               // 件数バッジの上限（それ以上は「9+」）
  };

  /* =========================================================
     MH_CORE: DOMに依存しない純粋関数（Nodeでテストする）
     ========================================================= */
  function addDays(dateStr, n) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return dt.toISOString().slice(0, 10);
  }
  function dayOfWeek(dateStr) { // 0=日
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }
  function weekStartOf(dateStr) { // 月曜始まり
    const dow = dayOfWeek(dateStr);
    return addDays(dateStr, dow === 0 ? -6 : 1 - dow);
  }
  function diffDays(a, b) {
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  }
  function isValidDateStr(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
    const t = Date.parse(s + 'T00:00:00Z');
    return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
  }
  function toMinutes(v) {
    if (!/^\d{2}:\d{2}$/.test(v || '')) return null;
    const [h, m] = v.split(':').map(Number);
    return h < 24 && m < 60 ? h * 60 + m : null;
  }

  /** キーワード・カテゴリで絞り込む（getFilteredEvents のキーワード対象と同じ項目）。 */
  function matchesQuery(ev, query, deps) {
    if (query.category && ev.category !== query.category) return false;
    const kw = String(query.keyword || '').trim().toLowerCase();
    if (!kw) return true;
    const campus = deps.campusLabel ? deps.campusLabel(ev.campus) : '';
    const hay = `${ev.title || ''} ${ev.organizer || ''} ${ev.description || ''} ${ev.location || ''} ${campus}`.toLowerCase();
    return kw.split(/\s+/).every(part => hay.includes(part));
  }

  /** 通常イベント（scope=circle・長期でない）か */
  function isRegular(ev, deps) {
    return ev && ev.isPublished && deps.getEventScope(ev) !== 'schedule' && !deps.isLongRunningEvent(ev);
  }

  /** その日の行（scope に応じて通常イベント or 学事の行事・休業） */
  function dayRows(events, date, scope, deps) {
    if (scope === 'schedule') {
      return events.filter(ev => ev && ev.isPublished && deps.getEventScope(ev) === 'schedule'
        && !ev.weeklyClassOnly && deps.isEventOnDate(ev, date));
    }
    return events.filter(ev => isRegular(ev, deps) && deps.isEventOnDate(ev, date));
  }

  /** その日の学事日程（見出しに併記する用）: 授業週と行事・休業を分ける */
  function scheduleOn(events, date, deps) {
    const weekly = [], other = [];
    for (const ev of events) {
      if (!ev || !ev.isPublished || deps.getEventScope(ev) !== 'schedule' || !deps.isEventOnDate(ev, date)) continue;
      (ev.weeklyClassOnly ? weekly : other).push(ev.title);
    }
    return { weekly, other };
  }

  /** 行の状態。今日は既存の判定（getHomeTodayStatus / isHomeTodayAvailable）をそのまま使う。 */
  function rowState(ev, date, today, now, deps) {
    if (date < today) return { group: 'past', label: '終了', rank: 9 };
    if (deps.isMultiDay(ev)) {
      const total = deps.eventDurationDays(ev);
      const nth = diffDays(ev.date, date) + 1;
      return { group: 'active', label: date === deps.getEventEnd(ev) ? '最終日' : `${total}日間の${nth}日目`, rank: 2, multi: true };
    }
    if (date > today) return { group: 'active', label: '', rank: 1 };
    // 今日の単日イベント
    const st = deps.getHomeTodayStatus(ev, today, now);
    const available = deps.isHomeTodayAvailable(ev, now);
    if (available) return { group: 'active', label: st.label, rank: st.rank };
    const end = toMinutes(ev.endTime);
    if (end !== null) return { group: 'done', label: '本日終了', rank: 5, ended: true };
    // 終了時刻がない＝開始を過ぎただけ。終了とは断定しない。
    return { group: 'done', label: `${ev.startTime}開始（終了時刻不明）`, rank: 4, ended: false };
  }

  function sortRows(rows, date, today, now, deps) {
    return rows
      .map(ev => ({ ev, state: rowState(ev, date, today, now, deps) }))
      .sort((a, b) => {
        if (date === today && a.state.rank !== b.state.rank) return a.state.rank - b.state.rank;
        return String(a.ev.startTime || '99:99').localeCompare(String(b.ev.startTime || '99:99'))
          || (deps.sameDayOrderCompare ? deps.sameDayOrderCompare(a.ev, b.ev, today) : 0)
          || String(a.ev.id).localeCompare(String(b.ev.id));
      });
  }

  /**
   * カレンダーバー／月表示の1日分の情報。
   * count: 通常イベントの総数（終了済みも含む。長期・学事は含まない）
   * mark : 学事モード用。行事・休業がある日だけ true（授業週は数えない）
   */
  function dayBadge(events, date, scope, query, deps) {
    if (scope === 'schedule') {
      const rows = dayRows(events, date, 'schedule', deps);
      return { count: rows.length, mark: rows.length > 0 };
    }
    const rows = dayRows(events, date, scope, deps).filter(ev => matchesQuery(ev, query, deps));
    return { count: rows.length, mark: false };
  }

  /**
   * アジェンダのモデル。from〜to の日付を順に並べ、行のない日の連続は1区間に圧縮する。
   * 今日の日は active（これから）と done（開始・終了済み）に分け、done は折りたたみ用。
   * 不変条件: 各 day について count === active.length + done.length（日別画面専用の行はない。
   *           表示上の折りたたみは UI 側の都合で、件数は常にこの合計）
   */
  function buildAgendaModel(events, opts, deps) {
    const { from, to, today, now } = opts;
    const scope = opts.scope || '';
    const query = opts.query || {};
    const segments = [];
    let emptyRun = null;
    const flushEmpty = () => { if (emptyRun) { segments.push(emptyRun); emptyRun = null; } };
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const rows = dayRows(events, date, scope, deps).filter(ev => scope === 'schedule' || matchesQuery(ev, query, deps));
      const sched = scheduleOn(events, date, deps);
      const isToday = date === today;
      if (!rows.length && !isToday) {
        if (!emptyRun) emptyRun = { type: 'empty', from: date, to: date, weekly: sched.weekly.slice(0, 1) };
        else emptyRun.to = date;
        continue;
      }
      flushEmpty();
      const sorted = sortRows(rows, date, today, now, deps);
      const active = sorted.filter(r => r.state.group !== 'done');
      const done = sorted.filter(r => r.state.group === 'done');
      segments.push({
        type: 'day', date, isToday, isPast: date < today,
        count: sorted.length, active, done,
        weekly: sched.weekly, other: sched.other,
        tier: sorted.length <= MH_CONST.INLINE_LIMIT ? 'all'
          : sorted.length <= MH_CONST.INLINE_EXPAND_MAX ? 'expand' : 'dayview'
      });
    }
    flushEmpty();
    return { from, to, segments };
  }

  /** 今日会期中／指定月にかかる長期展示（終了日の近い順） */
  function longRunningOn(events, date, deps) {
    return events.filter(ev => ev && ev.isPublished && deps.getEventScope(ev) !== 'schedule'
      && deps.isLongRunningEvent(ev) && deps.isEventOnDate(ev, date))
      .sort((a, b) => deps.getEventEnd(a).localeCompare(deps.getEventEnd(b)) || a.date.localeCompare(b.date));
  }
  function longRunningInMonth(events, monthStart, monthEnd, today, deps) {
    const lower = monthStart < today ? today : monthStart;
    return events.filter(ev => ev && ev.isPublished && deps.getEventScope(ev) !== 'schedule'
      && deps.isLongRunningEvent(ev) && ev.date <= monthEnd && deps.getEventEnd(ev) >= lower)
      .sort((a, b) => deps.getEventEnd(a).localeCompare(deps.getEventEnd(b)) || a.date.localeCompare(b.date));
  }

  /** 検索結果（日付順）。includePast=false のときは終了日が今日以降のもの */
  function searchEvents(events, query, today, includePast, deps) {
    const kw = String(query.keyword || '').trim();
    if (!kw && !query.category) return [];
    return events
      .filter(ev => ev && ev.isPublished && deps.getEventScope(ev) !== 'schedule')
      .filter(ev => includePast || deps.getEventEnd(ev) >= today)
      .filter(ev => matchesQuery(ev, query, deps))
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.startTime || '99:99').localeCompare(String(b.startTime || '99:99')));
  }

  /** 時間帯（日別画面のチップ）。開始時刻が不明なら 'unknown' */
  function timeSlot(ev) {
    const m = toMinutes(ev.startTime);
    if (m === null) return 'unknown';
    if (m < 12 * 60) return 'morning';
    if (m < 17 * 60) return 'afternoon';
    return 'evening';
  }

  /** URL ⇄ 状態。m（プレビュー指定）は常に保持し、不正値は落とす。 */
  function parseHomeUrl(search) {
    const p = new URLSearchParams(search || '');
    const date = isValidDateStr(p.get('date')) ? p.get('date') : null;
    const viewRaw = p.get('view');
    let view = ['month', 'search', 'day'].includes(viewRaw) ? viewRaw : null;
    if (view === 'day' && !date) view = null;
    const q = (p.get('q') || '').slice(0, 100);
    const normalized = (p.has('date') && !date) || (viewRaw && !view);
    return { date, view, q, m: p.get('m'), normalized: !!normalized };
  }
  function buildHomeUrl(state, base) {
    const p = new URLSearchParams();
    if (state.m) p.set('m', state.m);
    if (state.date) p.set('date', state.date);
    if (state.view) p.set('view', state.view);
    if (state.view === 'search' && state.q) p.set('q', state.q);
    const qs = p.toString();
    return (base || '/') + (qs ? '?' + qs : '');
  }

  const MH_CORE = {
    MH_CONST, addDays, dayOfWeek, weekStartOf, diffDays, isValidDateStr, toMinutes,
    matchesQuery, isRegular, dayRows, scheduleOn, rowState, sortRows, dayBadge,
    buildAgendaModel, longRunningOn, longRunningInMonth, searchEvents, timeSlot,
    parseHomeUrl, buildHomeUrl
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = MH_CORE;
    return;
  }
  root.MH_CORE = MH_CORE;

  /* =========================================================
     ここから下はブラウザ専用（UI）
     ========================================================= */
  const doc = root.document;
  const MQ = root.matchMedia('(max-width: 768px)');
  const AUTO_HIDE_HEADER = true; // MH_AUTO_HIDE_HEADER: 実機で不具合があれば false にする
  const reduceMotion = root.matchMedia('(prefers-reduced-motion: reduce)');
  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
  const SLOT_LABELS = { morning: '午前', afternoon: '午後', evening: '夜（17時〜）', unknown: '時刻未定' };

  function deps() {
    const home = (root.WC_UX && root.WC_UX.home) || {};
    return {
      isEventOnDate: root.isEventOnDate,
      isLongRunningEvent: root.isLongRunningEvent,
      isMultiDay: root.isMultiDay,
      getEventEnd: root.getEventEnd,
      eventDurationDays: root.eventDurationDays,
      getEventScope: root.getEventScope,
      sameDayOrderCompare: root.sameDayOrderCompare,
      campusLabel: root.campusLabel,
      getHomeTodayStatus: home.getHomeTodayStatus,
      isHomeTodayAvailable: home.isHomeTodayAvailable
    };
  }
  function ready() {
    const d = deps();
    return Object.values(d).every(fn => typeof fn === 'function') && typeof root.getPublishedEvents === 'function';
  }
  const esc = s => (typeof root.escapeHtml === 'function' ? root.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s));
  const nowMinutes = () => ((root.WC_UX && root.WC_UX.home && root.WC_UX.home.getHomeNowMinutes) ? root.WC_UX.home.getHomeNowMinutes() : 0);
  const todayStr = () => root.getTodayStr();
  const allEvents = () => root.getPublishedEvents();
  const track = (name, params) => { try { if (typeof root.trackEvent === 'function') root.trackEvent(name, params || {}); } catch (_) {} };

  function md(dateStr) { const [, m, d] = dateStr.split('-').map(Number); return `${m}/${d}`; }
  function mdw(dateStr) { return `${md(dateStr)}（${WEEKDAYS[dayOfWeek(dateStr)]}）`; }
  function longDate(dateStr) { const [, m, d] = dateStr.split('-').map(Number); return `${m}月${d}日 ${WEEKDAYS[dayOfWeek(dateStr)]}曜日`; }

  /* ---------- 状態 ---------- */
  const state = {
    active: false,
    selectedDate: null,
    visibleDate: null,
    weekStart: null,
    overlay: null,        // null | 'month' | 'search' | 'day'
    dayViewDate: null,
    monthCursor: null,    // 'YYYY-MM-01'
    query: { keyword: '', category: '' },
    includePast: false,
    dayFilter: { category: '', slot: '', campus: '' },
    from: null, to: null,
    scrollLockUntil: 0,
    lastScrollY: 0,
    headerHidden: false,
    pushedDepth: 0,       // このモジュールが積んだ履歴の数（×で閉じるとき back してよいか）
    todaySnapshot: '',
    lastToday: null
  };
  const urlM = () => new URLSearchParams(root.location.search).get('m');
  // script.js / events.js のトップレベル let・const は window のプロパティにならないため、識別子で参照する
  /* global activeFilters, selectedEventIds, CATEGORY_LABELS */
  const filtersRef = () => (typeof activeFilters !== 'undefined' ? activeFilters : null);
  const selectedRef = () => (typeof selectedEventIds !== 'undefined' ? selectedEventIds : null);
  const categoryLabelsRef = () => (typeof CATEGORY_LABELS !== 'undefined' ? CATEGORY_LABELS : {});

  /* ---------- DOM の骨組み ---------- */
  let rootEl, barEl, weekEl, rangeEl, monthEl, scopeEl, agendaEl, sentinelEl, overlayEl;

  function scopeValue() { const f = filtersRef(); return (f && f.scope) || ''; }

  function buildShell() {
    rootEl = doc.createElement('div');
    rootEl.id = 'mh-root';
    rootEl.innerHTML = `
      <h1 class="mh-visually-hidden">早稲田のイベントを、ひとつのカレンダーで。</h1>
      <div class="mh-bar" id="mh-bar">
        <div class="mh-bar-top">
          <span class="mh-range" id="mh-range" aria-live="polite"></span>
          <span class="mh-week-label" id="mh-week-label"></span>
          <button type="button" class="mh-icon-btn" id="mh-prev-week" aria-label="前の週">‹</button>
          <button type="button" class="mh-icon-btn" id="mh-next-week" aria-label="次の週">›</button>
          <button type="button" class="mh-text-btn" id="mh-month-btn" aria-expanded="false" aria-controls="mh-month">月表示</button>
          <button type="button" class="mh-icon-btn" id="mh-search-btn" aria-label="イベントを検索">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>
          </button>
        </div>
        <div class="mh-week" id="mh-week" role="group" aria-label="週カレンダー"></div>
        <p class="mh-legend" id="mh-legend" hidden>●＝休業・行事などがある日</p>
        <div class="mh-month" id="mh-month" hidden></div>
      </div>
      <div class="mh-scope" id="mh-scope" role="group" aria-label="表示範囲">
        <button type="button" class="mh-chip" data-scope="">すべて</button>
        <button type="button" class="mh-chip" data-scope="circle">イベント</button>
        <button type="button" class="mh-chip" data-scope="schedule">学事日程</button>
        <button type="button" class="mh-chip mh-chip-select" id="mh-select-toggle" aria-pressed="false">複数選択</button>
      </div>
      <div class="mh-agenda" id="mh-agenda"></div>
      <div class="mh-sentinel" id="mh-sentinel" aria-hidden="true"></div>
      <div class="mh-overlay" id="mh-overlay" hidden></div>`;
    barEl = rootEl.querySelector('#mh-bar');
    weekEl = rootEl.querySelector('#mh-week');
    rangeEl = rootEl.querySelector('#mh-range');
    monthEl = rootEl.querySelector('#mh-month');
    scopeEl = rootEl.querySelector('#mh-scope');
    agendaEl = rootEl.querySelector('#mh-agenda');
    sentinelEl = rootEl.querySelector('#mh-sentinel');
    overlayEl = rootEl.querySelector('#mh-overlay');

    const anchor = doc.querySelector('.recommend-entry')?.closest('.container');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(rootEl, anchor.nextSibling);
    else (doc.querySelector('#today-section') || doc.body).before(rootEl);

    rootEl.querySelector('#mh-prev-week').addEventListener('click', () => moveWeek(-1));
    rootEl.querySelector('#mh-next-week').addEventListener('click', () => moveWeek(1));
    rootEl.querySelector('#mh-month-btn').addEventListener('click', () => state.overlay === 'month' ? closeOverlay() : openOverlay('month'));
    rootEl.querySelector('#mh-search-btn').addEventListener('click', () => openOverlay('search'));
    weekEl.addEventListener('click', e => {
      const cell = e.target.closest('.mh-day-cell');
      if (cell) selectDate(cell.dataset.date, { push: true, source: 'week', keyboard: e.detail === 0 });
    });
    weekEl.addEventListener('keydown', onWeekKeydown);
    monthEl.addEventListener('click', onMonthClick);
    scopeEl.addEventListener('click', onScopeClick);
    agendaEl.addEventListener('click', onAgendaClick);
    overlayEl.addEventListener('click', onOverlayClick);
    overlayEl.addEventListener('input', onOverlayInput);
  }

  /* ---------- カレンダーバー ---------- */
  function renderWeek() {
    const d = deps(), events = allEvents(), today = todayStr(), scope = scopeValue();
    const start = state.weekStart;
    const end = addDays(start, 6);
    rangeEl.textContent = `${md(start)}〜${md(end)}`;
    const weekLabelEl = rootEl.querySelector('#mh-week-label');
    const focus = state.visibleDate && state.visibleDate >= start && state.visibleDate <= end ? state.visibleDate
      : (today >= start && today <= end ? today : start);
    let sched = scheduleOn(events, focus, d).weekly[0] || '';
    for (let i = 0; i < 7 && !sched; i++) sched = scheduleOn(events, addDays(start, i), d).weekly[0] || '';
    weekLabelEl.textContent = scope === 'schedule' && sched ? sched.replace('秋学期', '').replace('春学期', '') : '';
    rootEl.querySelector('#mh-legend').hidden = scope !== 'schedule';
    requestAnimationFrame(measure);
    let html = '';
    const focusDate = state.visibleDate && state.visibleDate >= start && state.visibleDate <= end ? state.visibleDate
      : (today >= start && today <= end ? today : start);
    for (let i = 0; i < 7; i++) {
      const date = addDays(start, i);
      const badge = dayBadge(events, date, scope, {}, d);
      const dow = dayOfWeek(date);
      const holiday = typeof root.getHolidayName === 'function' ? root.getHolidayName(date) : '';
      const isToday = date === today, isVisible = date === state.visibleDate;
      const countText = scope === 'schedule'
        ? (badge.mark ? '●' : '')
        : (badge.count === 0 ? '' : badge.count > MH_CONST.MAX_BADGE ? `${MH_CONST.MAX_BADGE}+` : String(badge.count));
      const label = `${longDate(date)}${holiday ? '（' + holiday + '）' : ''} ` +
        (scope === 'schedule' ? (badge.mark ? '休業・行事あり' : '休業・行事なし') : `掲載イベント${badge.count}件（展示を除く）`) +
        (isVisible ? '・表示中' : '');
      html += `<button type="button" class="mh-day-cell${isToday ? ' is-today' : ''}${isVisible ? ' is-visible' : ''}${dow === 0 || holiday ? ' is-sun' : dow === 6 ? ' is-sat' : ''}${date < today ? ' is-past' : ''}"
        data-date="${date}" aria-label="${esc(label)}"${isToday ? ' aria-current="date"' : ''} tabindex="${date === focusDate ? '0' : '-1'}">
        <span class="mh-dow" aria-hidden="true">${WEEKDAYS[dow]}</span>
        <span class="mh-date" aria-hidden="true">${Number(date.slice(8))}</span>
        <span class="mh-count${countText ? '' : ' is-empty'}" aria-hidden="true">${countText || '·'}</span>
      </button>`;
    }
    weekEl.innerHTML = html;
  }

  function onWeekKeydown(e) {
    const cell = e.target.closest('.mh-day-cell');
    if (!cell) return;
    let delta = 0;
    if (e.key === 'ArrowRight') delta = 1;
    else if (e.key === 'ArrowLeft') delta = -1;
    else return;
    e.preventDefault();
    const target = addDays(cell.dataset.date, delta);
    selectDate(target, { replace: true, source: 'keyboard', keyboard: true });
    requestAnimationFrame(() => weekEl.querySelector(`[data-date="${target}"]`)?.focus());
  }

  function moveWeek(delta) {
    const today = todayStr();
    const start = addDays(state.weekStart, delta * 7);
    const target = (today >= start && today <= addDays(start, 6)) ? today : start;
    selectDate(target, { push: true, source: 'week-arrow' });
  }

  /* ---------- アジェンダ ---------- */
  function rowHTML(item, opts) {
    const ev = item.ev, st = item.state;
    const id = esc(String(ev.id));
    const time = typeof root.getEventTimeLabel === 'function' ? root.getEventTimeLabel(ev, true) : (ev.startTime || '時刻未定');
    const loc = typeof root.getEventLocationLabel === 'function' ? root.getEventLocationLabel(ev) : (ev.location || '');
    const isSchedule = root.getEventScope(ev) === 'schedule';
    const meta = [ev.organizer, isSchedule && !ev.location ? '' : loc].filter(Boolean).map(esc).join('<span class="mh-sep">・</span>');
    const chip = st.label ? `<span class="mh-status mh-status-${st.rank}">${esc(st.label)}</span>` : '';
    const dateLine = opts && opts.withDate ? `<span class="mh-row-date">${esc(mdw(ev.date))}${root.isMultiDay(ev) ? '〜' + esc(md(root.getEventEnd(ev))) : ''}</span>` : '';
    const sel = selectedRef();
    const checked = sel && sel.has(String(ev.id)) ? 'checked' : '';
    const href = typeof root.buildEventPageUrl === 'function' ? root.buildEventPageUrl(ev) : '#';
    const tag = opts && opts.link ? 'a' : 'button';
    const attrs = opts && opts.link ? `href="${esc(href)}"` : `type="button" data-open="${id}"`;
    return `<div class="mh-row${st.group === 'done' || st.group === 'past' ? ' is-done' : ''}">
      ${isSchedule ? '' : `<label class="event-card-select mh-select" title="カレンダー一括追加に選択"><input type="checkbox" ${checked} data-select="${id}" aria-label="${esc(ev.title)}を選択"></label>`}
      <${tag} class="mh-row-main" ${attrs}>
        <span class="mh-time">${esc(st.multi ? (ev.startTime || '') : time)}</span>
        <span class="mh-body">
          ${dateLine}
          <span class="mh-title">${esc(ev.title)}</span>
          ${meta ? `<span class="mh-meta">${meta}</span>` : ''}
          ${chip || (ev.category && !isSchedule) ? `<span class="mh-tags">${chip}${!isSchedule && ev.category ? `<span class="tag ${esc(root.categoryClass ? root.categoryClass(ev.category) : '')} mh-cat">${esc(root.categoryLabel ? root.categoryLabel(ev.category) : ev.category)}</span>` : ''}</span>` : ''}
        </span>
      </${tag}>
    </div>`;
  }

  function dayHeadingText(seg) {
    const parts = [];
    const holiday = typeof root.getHolidayName === 'function' ? root.getHolidayName(seg.date) : '';
    if (holiday) parts.push(holiday);
    const scope = scopeValue();
    if (seg.weekly && seg.weekly[0] && scope !== 'circle') parts.push(seg.weekly[0]);
    if (scope === '' && seg.other && seg.other.length) parts.push(...seg.other);
    return parts;
  }

  function daySegmentHTML(seg) {
    const scope = scopeValue();
    const notes = dayHeadingText(seg);
    const prefix = seg.isToday ? '今日 ' : '';
    const countLabel = scope === 'schedule' ? (seg.count ? `${seg.count}件` : '') : `${seg.count}件`;
    let body = '';
    const active = seg.active;
    if (!seg.count && seg.isToday) {
      body += `<p class="mh-empty-today">${scope === 'schedule' ? '今日の休業・行事はありません。' : '今日の掲載イベントはありません。この先の予定は下に続きます。'}</p>`;
    }
    const visible = seg.tier === 'all' ? active : active.slice(0, MH_CONST.INLINE_LIMIT);
    const rest = seg.tier === 'all' ? [] : active.slice(MH_CONST.INLINE_LIMIT);
    body += visible.map(r => rowHTML(r)).join('');
    if (rest.length && seg.tier === 'expand') {
      body += `<div class="mh-rest" id="mh-rest-${seg.date}" hidden>${rest.map(r => rowHTML(r)).join('')}</div>
        <button type="button" class="mh-more" data-expand="${seg.date}" aria-expanded="false" aria-controls="mh-rest-${seg.date}">残り${rest.length}件を表示</button>`;
    } else if (rest.length && seg.tier === 'dayview') {
      body += `<button type="button" class="mh-more mh-more-dayview" data-dayview="${seg.date}">${esc(mdw(seg.date))}の${seg.count}件をすべて見る</button>`;
    }
    if (seg.isToday && scope !== 'schedule') {
      const longs = longRunningOn(allEvents(), seg.date, deps());
      if (longs.length) {
        body += `<div class="mh-long">
          <button type="button" class="mh-long-toggle" aria-expanded="false" aria-controls="mh-long-list">🖼 会期中の展示・長期企画 <strong>${longs.length}件</strong><span aria-hidden="true">▸</span></button>
          <div class="mh-long-list" id="mh-long-list" hidden>
            ${longs.map(ev => {
              const soon = diffDays(seg.date, root.getEventEnd(ev)) <= 7;
              return `<button type="button" class="mh-long-item" data-open="${esc(String(ev.id))}"><span class="mh-long-title">${esc(ev.title)}</span><span class="mh-long-date">〜${esc(md(root.getEventEnd(ev)))}${soon ? ' <em>まもなく終了</em>' : ''}</span></button>`;
            }).join('')}
            <p class="mh-note">会期内の企画です。開館日・休館日は公式情報をご確認ください。</p>
          </div>
        </div>`;
      }
    }
    if (seg.done.length) {
      body += `<div class="mh-done">
        <button type="button" class="mh-done-toggle" aria-expanded="false" aria-controls="mh-done-${seg.date}">開始・終了済み ${seg.done.length}件<span aria-hidden="true">▸</span></button>
        <div class="mh-done-list" id="mh-done-${seg.date}" hidden>${seg.done.map(r => rowHTML(r)).join('')}</div>
      </div>`;
    }
    return `<section class="mh-day${seg.isToday ? ' is-today' : ''}${seg.isPast ? ' is-past' : ''}" data-date="${seg.date}" aria-labelledby="mh-h-${seg.date}">
      <h2 class="mh-day-heading" id="mh-h-${seg.date}" tabindex="-1">
        <span class="mh-day-date">${prefix}${esc(mdw(seg.date))}</span>
        ${notes.length ? `<span class="mh-day-note">${notes.map(esc).join('・')}</span>` : ''}
        ${countLabel ? `<span class="mh-day-count">${countLabel}</span>` : ''}
      </h2>
      ${body}
    </section>`;
  }

  function emptySegmentHTML(seg) {
    const scope = scopeValue();
    const label = seg.from === seg.to ? mdw(seg.from) : `${mdw(seg.from)}〜${mdw(seg.to)}`;
    const text = scope === 'schedule' ? '休業・行事なし' : '掲載イベントなし';
    return `<div class="mh-empty" data-from="${seg.from}" data-to="${seg.to}" tabindex="-1">
      <span class="mh-empty-date">${esc(label)}</span><span class="mh-empty-text">${text}</span>
      <span class="mh-empty-jump" hidden></span>
    </div>`;
  }

  function renderAgenda() {
    const d = deps(), today = todayStr();
    const model = buildAgendaModel(allEvents(), {
      from: state.from, to: state.to, today, now: nowMinutes(), scope: scopeValue(), query: {}
    }, d);
    let html = '';
    if (state.from > today || state.from < today) {
      html += `<button type="button" class="mh-more mh-earlier" data-earlier="1">${state.from < today ? 'さらに前の日を表示' : '今日に戻る'}</button>`;
    }
    for (const seg of model.segments) html += seg.type === 'day' ? daySegmentHTML(seg) : emptySegmentHTML(seg);
    agendaEl.innerHTML = html;
    state.todaySnapshot = todaySnapshot();
    updateHeadingCache();
  }

  function appendDays(n) {
    const from = addDays(state.to, 1), to = addDays(state.to, n);
    state.to = to;
    const model = buildAgendaModel(allEvents(), { from, to, today: todayStr(), now: nowMinutes(), scope: scopeValue(), query: {} }, deps());
    const segs = model.segments.slice();
    const last = agendaEl.lastElementChild;
    if (segs.length && segs[0].type === 'empty' && last && last.classList.contains('mh-empty')) {
      // 境目の「掲載イベントなし」を1区間にまとめる
      const merged = { type: 'empty', from: last.dataset.from, to: segs[0].to };
      const tmp = doc.createElement('div');
      tmp.innerHTML = emptySegmentHTML(merged);
      last.replaceWith(tmp.firstElementChild);
      segs.shift();
    }
    agendaEl.insertAdjacentHTML('beforeend', segs.map(seg => seg.type === 'day' ? daySegmentHTML(seg) : emptySegmentHTML(seg)).join(''));
    updateHeadingCache();
  }

  function todaySnapshot() {
    const today = todayStr(), now = nowMinutes();
    const rows = dayRows(allEvents(), today, scopeValue(), deps());
    return today + '|' + scopeValue() + '|' + rows.map(ev => ev.id + ':' + rowState(ev, today, today, now, deps()).label).join(',');
  }

  function rerenderToday() {
    const today = todayStr();
    const old = agendaEl.querySelector(`.mh-day[data-date="${today}"]`);
    if (!old) return;
    const model = buildAgendaModel(allEvents(), { from: today, to: today, today, now: nowMinutes(), scope: scopeValue(), query: {} }, deps());
    const seg = model.segments[0];
    if (!seg) return;
    const tmp = doc.createElement('div');
    tmp.innerHTML = daySegmentHTML(seg);
    old.replaceWith(tmp.firstElementChild);
    state.todaySnapshot = todaySnapshot();
    updateHeadingCache();
  }

  function onAgendaClick(e) {
    const t = e.target;
    const sel = t.closest('input[data-select]');
    if (sel) { if (typeof root.toggleEventSelection === 'function') root.toggleEventSelection(sel.dataset.select, sel.checked); return; }
    const open = t.closest('[data-open]');
    if (open) { if (typeof root.openModal === 'function') root.openModal(open.dataset.open); return; }
    const exp = t.closest('[data-expand]');
    if (exp) { toggleDisclosure(exp, `残り${agendaEl.querySelectorAll(`#mh-rest-${exp.dataset.expand} .mh-row`).length}件を表示`, '閉じる'); return; }
    const dv = t.closest('[data-dayview]');
    if (dv) { openOverlay('day', { date: dv.dataset.dayview }); return; }
    const toggle = t.closest('.mh-long-toggle, .mh-done-toggle');
    if (toggle) { toggleDisclosure(toggle); return; }
    const earlier = t.closest('[data-earlier]');
    if (earlier) {
      const today = todayStr();
      if (state.from > today) { state.from = today; renderAgenda(); jumpTo(today, {}); }
      else { state.from = addDays(state.from, -14); renderAgenda(); }
    }
  }

  function toggleDisclosure(btn, closedText, openText) {
    const panel = doc.getElementById(btn.getAttribute('aria-controls'));
    if (!panel) return;
    const open = btn.getAttribute('aria-expanded') === 'true';
    panel.hidden = open;
    btn.setAttribute('aria-expanded', String(!open));
    if (closedText) btn.textContent = open ? closedText : openText;
    updateHeadingCache();
  }

  /* ---------- スクロール位置と選択日 ---------- */
  let headingCache = [];
  function updateHeadingCache() {
    headingCache = Array.from(agendaEl.querySelectorAll('.mh-day, .mh-empty'));
  }
  function stickyOffset() {
    const rect = barEl.getBoundingClientRect();
    return Math.max(0, rect.bottom) + 4;
  }

  function findTarget(date) {
    const exact = agendaEl.querySelector(`.mh-day[data-date="${date}"]`);
    if (exact) return { el: exact, inEmpty: false };
    for (const el of agendaEl.querySelectorAll('.mh-empty')) {
      if (el.dataset.from <= date && date <= el.dataset.to) return { el, inEmpty: true };
    }
    return null;
  }

  function ensureRange(date) {
    let changed = false;
    if (date < state.from) { state.from = date; changed = true; }
    if (date > state.to) { state.to = addDays(date, MH_CONST.EXTEND_DAYS); changed = true; }
    if (changed) renderAgenda();
  }

  function jumpTo(date, opts) {
    ensureRange(date);
    const target = findTarget(date);
    if (!target) return;
    agendaEl.querySelectorAll('.mh-empty-jump').forEach(n => { n.hidden = true; n.textContent = ''; });
    if (target.inEmpty) {
      const note = target.el.querySelector('.mh-empty-jump');
      if (note) { note.hidden = false; note.textContent = `${mdw(date)} は${scopeValue() === 'schedule' ? '休業・行事なし' : '掲載イベントなし'}`; }
    }
    state.scrollLockUntil = Date.now() + MH_CONST.SCROLL_LOCK_MS;
    const absTop = target.el.getBoundingClientRect().top + root.scrollY;
    // 下へ移動するとヘッダーは自動で隠れ、上へ移動すると現れる。着地時の状態で位置を合わせる。
    const headerWillShow = !AUTO_HIDE_HEADER || absTop - barEl.offsetHeight < root.scrollY || absTop < rootEl.offsetTop + 200;
    const y = absTop - barEl.offsetHeight - (headerWillShow ? headerHeight() : 0) - 4;
    if (AUTO_HIDE_HEADER) setHeaderHidden(!headerWillShow);
    root.scrollTo({ top: Math.max(0, y), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    if (opts && opts.keyboard) {
      const focusEl = target.el.querySelector('.mh-day-heading') || target.el;
      setTimeout(() => focusEl.focus({ preventScroll: true }), reduceMotion.matches ? 0 : 400);
    }
  }

  function setVisible(date, { followWeek = true } = {}) {
    if (!date || date === state.visibleDate) return;
    state.visibleDate = date;
    if (followWeek && (date < state.weekStart || date > addDays(state.weekStart, 6))) state.weekStart = weekStartOf(date);
    renderWeek();
  }

  function selectDate(date, opts) {
    if (!isValidDateStr(date)) return;
    state.selectedDate = date;
    state.weekStart = weekStartOf(date);
    state.visibleDate = null;
    setVisible(date);
    if (opts && opts.push) pushUrl({ date });
    if (opts && opts.replace) replaceUrl({ date });
    jumpTo(date, opts || {});
    track('mh_date_tap', { source: (opts && opts.source) || 'unknown' });
  }

  function onScroll() {
    const y = root.scrollY;
    const dy = y - state.lastScrollY;
    state.lastScrollY = y;
    if (state.overlay === 'month' && Math.abs(dy) > 30 && Date.now() > state.scrollLockUntil) closeOverlay();
    updateHeader(dy, y);
    if (Date.now() < state.scrollLockUntil) return;
    const offset = stickyOffset();
    let current = null;
    for (const el of headingCache) {
      if (el.getBoundingClientRect().top - offset > 1) break;
      current = el;
    }
    if (!current) current = headingCache[0];
    if (!current) return;
    const date = current.dataset.date || current.dataset.from;
    setVisible(date);
    // 末尾付近で30日分を追加（既存の部分は作り直さない＝開いた項目が閉じてずれない）
    if (sentinelEl.getBoundingClientRect().top < root.innerHeight * 2) appendDays(MH_CONST.EXTEND_DAYS);
  }
  let scrollTicking = false;
  function onScrollRaf() {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => { scrollTicking = false; if (state.active) onScroll(); });
  }
  root.addEventListener('scrollend', () => { state.scrollLockUntil = 0; });

  /* ---------- sticky の位置合わせ ---------- */
  function measure() {
    if (!rootEl) return;
    rootEl.style.setProperty('--mh-header', headerHeight() + 'px');
    const monthOpen = !monthEl.hidden;
    if (!monthOpen) rootEl.style.setProperty('--mh-bar-h', barEl.offsetHeight + 'px');
  }

  /* ---------- ヘッダーの自動非表示 ---------- */
  function headerHeight() { return doc.querySelector('.site-header')?.offsetHeight || 56; }
  function setHeaderHidden(hidden) {
    if (state.headerHidden === hidden) return;
    state.headerHidden = hidden;
    doc.body.classList.toggle('mh-header-hidden', hidden);
  }
  function updateHeader(dy, y) {
    if (!AUTO_HIDE_HEADER) return;
    const header = doc.querySelector('.site-header');
    const nav = doc.getElementById('mobile-nav');
    if (state.overlay || nav?.classList.contains('open') || (header && header.contains(doc.activeElement))) { setHeaderHidden(false); return; }
    if (Date.now() < state.scrollLockUntil) return; // ジャンプ中は jumpTo が決めた状態を保つ
    const threshold = rootEl.offsetTop;
    if (y < threshold) { setHeaderHidden(false); return; }
    if (dy > 8) setHeaderHidden(true);
    else if (dy < -8) setHeaderHidden(false);
  }

  /* ---------- 月表示 ---------- */
  function renderMonth() {
    const d = deps(), events = allEvents(), today = todayStr(), scope = scopeValue();
    const cursor = state.monthCursor;
    const [y, m] = cursor.split('-').map(Number);
    const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const gridStart = weekStartOf(cursor);
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const date = addDays(gridStart, i);
      if (i >= 35 && date > monthEnd) break;
      const inMonth = date.slice(0, 7) === cursor.slice(0, 7);
      const badge = dayBadge(events, date, scope, {}, d);
      const dow = dayOfWeek(date);
      const holiday = typeof root.getHolidayName === 'function' ? root.getHolidayName(date) : '';
      const txt = scope === 'schedule' ? (badge.mark ? '●' : '') : (badge.count ? (badge.count > MH_CONST.MAX_BADGE ? `${MH_CONST.MAX_BADGE}+` : badge.count) : '');
      const label = `${longDate(date)} ` + (scope === 'schedule' ? (badge.mark ? '休業・行事あり' : '休業・行事なし') : `掲載イベント${badge.count}件`);
      cells += `<button type="button" class="mh-mcell${inMonth ? '' : ' is-out'}${date === today ? ' is-today' : ''}${date === state.visibleDate ? ' is-visible' : ''}${dow === 0 || holiday ? ' is-sun' : dow === 6 ? ' is-sat' : ''}" data-mdate="${date}" aria-label="${esc(label)}"${date === today ? ' aria-current="date"' : ''}>
        <span class="mh-mdate">${Number(date.slice(8))}</span><span class="mh-mcount">${txt}</span></button>`;
    }
    const longs = scope === 'schedule' ? [] : longRunningInMonth(events, cursor, monthEnd, today, d);
    monthEl.innerHTML = `
      <div class="mh-month-head">
        <button type="button" class="mh-icon-btn" data-month-nav="-1" aria-label="前の月">‹</button>
        <strong>${y}年${m}月</strong>
        <button type="button" class="mh-icon-btn" data-month-nav="1" aria-label="次の月">›</button>
        <button type="button" class="mh-text-btn" data-month-close="1">閉じる</button>
      </div>
      <div class="mh-month-dow" aria-hidden="true">${['月', '火', '水', '木', '金', '土', '日'].map(w => `<span>${w}</span>`).join('')}</div>
      <div class="mh-month-grid">${cells}</div>
      <p class="mh-note">${scope === 'schedule' ? '●は休業・行事などがある日です。' : '数字は掲載イベント数（展示・長期企画を除く）です。'}</p>
      ${longs.length ? `<div class="mh-long mh-month-long">
        <button type="button" class="mh-long-toggle" aria-expanded="false" aria-controls="mh-month-long-list">${m}月の展示・長期企画 <strong>${longs.length}件</strong><span aria-hidden="true">▸</span></button>
        <div class="mh-long-list" id="mh-month-long-list" hidden>
          ${longs.map(ev => `<button type="button" class="mh-long-item" data-open="${esc(String(ev.id))}"><span class="mh-long-title">${esc(ev.title)}</span><span class="mh-long-date">${esc(md(ev.date))}〜${esc(md(root.getEventEnd(ev)))}</span></button>`).join('')}
        </div>
      </div>` : ''}`;
  }

  function onMonthClick(e) {
    const t = e.target;
    const nav = t.closest('[data-month-nav]');
    if (nav) {
      const [y, m] = state.monthCursor.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1 + Number(nav.dataset.monthNav), 1));
      state.monthCursor = dt.toISOString().slice(0, 10);
      renderMonth();
      return;
    }
    if (t.closest('[data-month-close]')) { closeOverlay(); return; }
    const cell = t.closest('[data-mdate]');
    if (cell) {
      const date = cell.dataset.mdate;
      // 月表示の履歴(view=month)を日付の履歴に置き換える
      setOverlay(null);
      selectDate(date, { replace: true, source: 'month', keyboard: e.detail === 0 });
      return;
    }
    const open = t.closest('[data-open]');
    if (open && typeof root.openModal === 'function') { root.openModal(open.dataset.open); return; }
    const toggle = t.closest('.mh-long-toggle');
    if (toggle) toggleDisclosure(toggle);
  }

  /* ---------- 検索・日別画面（全画面オーバーレイ） ---------- */
  function categoryOptions(selected, events) {
    const labels = categoryLabelsRef();
    const used = new Set(events.map(ev => ev.category).filter(Boolean));
    const keys = Object.keys(labels).filter(k => used.has(k));
    return `<button type="button" class="mh-chip${selected ? '' : ' is-active'}" data-cat="" aria-pressed="${!selected}">すべて</button>` +
      keys.map(k => `<button type="button" class="mh-chip${selected === k ? ' is-active' : ''}" data-cat="${esc(k)}" aria-pressed="${selected === k}">${esc(labels[k])}</button>`).join('');
  }

  function renderSearch() {
    overlayEl.innerHTML = `
      <div class="mh-dialog" role="dialog" aria-modal="true" aria-labelledby="mh-search-title">
        <div class="mh-dialog-head">
          <h2 id="mh-search-title">イベントを検索</h2>
          <button type="button" class="mh-text-btn" data-close="1">閉じる</button>
        </div>
        <div class="mh-search-box">
          <input type="search" id="mh-search-input" enterkeyhint="search" autocomplete="off" placeholder="イベント名・団体名・場所など" value="${esc(state.query.keyword)}" aria-label="キーワード">
        </div>
        <div class="mh-chips" id="mh-search-cats" role="group" aria-label="カテゴリ">${categoryOptions(state.query.category, allEvents())}</div>
        <label class="mh-past-toggle"><input type="checkbox" id="mh-search-past" ${state.includePast ? 'checked' : ''}> 終了したイベントも含める</label>
        <div class="mh-dialog-body" id="mh-search-results"></div>
      </div>`;
    renderSearchResults();
    const input = overlayEl.querySelector('#mh-search-input');
    setTimeout(() => input && input.focus(), 50);
  }

  function renderSearchResults() {
    const box = overlayEl.querySelector('#mh-search-results');
    if (!box) return;
    const today = todayStr();
    const results = searchEvents(allEvents(), state.query, today, state.includePast, deps());
    if (!state.query.keyword.trim() && !state.query.category) {
      box.innerHTML = '<p class="mh-note">キーワードを入力するか、カテゴリを選んでください。</p>';
      return;
    }
    if (!results.length) {
      box.innerHTML = `<div class="mh-noresult"><p>条件に合うイベントは見つかりませんでした。</p>
        <button type="button" class="mh-more" data-clear-search="1">条件をすべて外す</button>
        ${state.includePast ? '' : '<button type="button" class="mh-more" data-include-past="1">終了したイベントも探す</button>'}</div>`;
      return;
    }
    box.innerHTML = `<p class="mh-result-count">${results.length}件</p>` + results.map(ev => {
      const st = { group: root.getEventEnd(ev) < today ? 'past' : 'active', label: root.getEventEnd(ev) < today ? '終了' : '', rank: 1 };
      return rowHTML({ ev, state: st }, { withDate: true, link: true });
    }).join('');
  }

  function renderDayView() {
    const date = state.dayViewDate;
    const d = deps(), today = todayStr();
    const rows = dayRows(allEvents(), date, scopeValue() === 'schedule' ? 'schedule' : '', d);
    const f = state.dayFilter;
    const campuses = [...new Set(rows.map(ev => ev.campus).filter(Boolean))];
    const slots = ['morning', 'afternoon', 'evening', 'unknown'].filter(s => rows.some(ev => timeSlot(ev) === s));
    const filtered = rows.filter(ev => (!f.category || ev.category === f.category)
      && (!f.slot || timeSlot(ev) === f.slot) && (!f.campus || ev.campus === f.campus));
    const sorted = sortRows(filtered, date, today, nowMinutes(), d);
    overlayEl.innerHTML = `
      <div class="mh-dialog" role="dialog" aria-modal="true" aria-labelledby="mh-day-title">
        <div class="mh-dialog-head">
          <h2 id="mh-day-title">${esc(mdw(date))}のイベント（${rows.length}件）</h2>
          <button type="button" class="mh-text-btn" data-close="1">閉じる</button>
        </div>
        <div class="mh-chips" role="group" aria-label="カテゴリ">${categoryOptions(f.category, rows).replace(/data-cat=/g, 'data-dcat=')}</div>
        <div class="mh-chips" role="group" aria-label="時間帯">
          <button type="button" class="mh-chip${f.slot ? '' : ' is-active'}" data-slot="" aria-pressed="${!f.slot}">全時間帯</button>
          ${slots.map(s => `<button type="button" class="mh-chip${f.slot === s ? ' is-active' : ''}" data-slot="${s}" aria-pressed="${f.slot === s}">${SLOT_LABELS[s]}</button>`).join('')}
        </div>
        ${campuses.length > 1 ? `<div class="mh-chips" role="group" aria-label="場所">
          <button type="button" class="mh-chip${f.campus ? '' : ' is-active'}" data-campus="" aria-pressed="${!f.campus}">全会場</button>
          ${campuses.map(c => `<button type="button" class="mh-chip${f.campus === c ? ' is-active' : ''}" data-campus="${esc(c)}" aria-pressed="${f.campus === c}">${esc(root.campusLabel ? root.campusLabel(c) : c)}</button>`).join('')}
        </div>` : ''}
        <div class="mh-dialog-body">
          <p class="mh-result-count">${sorted.length}件を表示</p>
          ${sorted.map(r => rowHTML(r, { link: true })).join('') || '<p class="mh-note">条件に合うイベントはありません。</p>'}
        </div>
      </div>`;
  }

  let searchTimer = null;
  function onOverlayInput(e) {
    if (e.target.id === 'mh-search-input') {
      state.query.keyword = e.target.value;
      renderSearchResults();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        replaceUrl({ view: 'search', q: state.query.keyword });
        if (state.query.keyword.trim()) track('mh_search', { length: state.query.keyword.trim().length });
      }, MH_CONST.SEARCH_DEBOUNCE_MS);
    } else if (e.target.id === 'mh-search-past') {
      state.includePast = e.target.checked;
      renderSearchResults();
    }
  }

  function onOverlayClick(e) {
    const t = e.target;
    if (t === overlayEl || t.closest('[data-close]')) { closeOverlay(); return; }
    const cat = t.closest('[data-cat]');
    if (cat) {
      state.query.category = cat.dataset.cat;
      overlayEl.querySelectorAll('[data-cat]').forEach(b => { const on = b.dataset.cat === state.query.category; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
      renderSearchResults();
      return;
    }
    if (t.closest('[data-clear-search]')) {
      state.query = { keyword: '', category: '' };
      renderSearch();
      replaceUrl({ view: 'search', q: '' });
      return;
    }
    if (t.closest('[data-include-past]')) { state.includePast = true; renderSearch(); return; }
    const dcat = t.closest('[data-dcat]'); if (dcat) { state.dayFilter.category = dcat.dataset.dcat; renderDayView(); return; }
    const slot = t.closest('[data-slot]'); if (slot) { state.dayFilter.slot = slot.dataset.slot; renderDayView(); return; }
    const camp = t.closest('[data-campus]'); if (camp) { state.dayFilter.campus = camp.dataset.campus; renderDayView(); return; }
    const sel = t.closest('input[data-select]');
    if (sel && typeof root.toggleEventSelection === 'function') root.toggleEventSelection(sel.dataset.select, sel.checked);
  }

  let overlayReturnFocus = null;
  function setOverlay(kind, opts) {
    const prev = state.overlay;
    state.overlay = kind;
    const monthBtn = rootEl.querySelector('#mh-month-btn');
    monthEl.hidden = kind !== 'month';
    monthBtn.setAttribute('aria-expanded', String(kind === 'month'));
    monthBtn.classList.toggle('is-active', kind === 'month');
    const full = kind === 'search' || kind === 'day';
    overlayEl.hidden = !full;
    doc.documentElement.classList.toggle('mh-locked', full);
    if (kind === 'month') {
      const base = state.visibleDate || todayStr();
      state.monthCursor = base.slice(0, 8) + '01';
      renderMonth();
      setHeaderHidden(false);
    } else if (kind === 'search') {
      if (opts && typeof opts.q === 'string') state.query.keyword = opts.q;
      renderSearch();
    } else if (kind === 'day') {
      state.dayViewDate = opts.date;
      state.dayFilter = { category: '', slot: '', campus: '' };
      renderDayView();
    } else {
      overlayEl.innerHTML = '';
    }
    if (full && !prev) overlayReturnFocus = doc.activeElement;
    if (!kind && prev && (prev === 'search' || prev === 'day') && overlayReturnFocus && overlayReturnFocus.focus) {
      try { overlayReturnFocus.focus({ preventScroll: true }); } catch (_) {}
      overlayReturnFocus = null;
    }
  }

  function openOverlay(kind, opts) {
    if (state.overlay === kind && kind !== 'day') return;
    const urlState = { view: kind };
    if (kind === 'day') urlState.date = opts.date;
    if (kind === 'search') urlState.q = state.query.keyword;
    if (state.overlay) replaceUrl(urlState); else pushUrl(urlState);
    setOverlay(kind, opts);
    track(kind === 'month' ? 'mh_month_open' : kind === 'search' ? 'mh_search_open' : 'mh_dayview_open', {});
  }

  function closeOverlay() {
    if (!state.overlay) return;
    // このモジュールが積んだ履歴なら戻る（Androidの戻ると同じ動き）。そうでなければURLを置き換える。
    if (root.history.state && root.history.state.mh && state.pushedDepth > 0) {
      root.history.back();
    } else {
      setOverlay(null);
      replaceUrl({});
    }
  }

  /* ---------- 履歴（URL） ---------- */
  function currentUrlState(extra) {
    return Object.assign({ m: urlM(), date: state.selectedDate || null, view: null, q: '' }, extra || {});
  }
  function pushUrl(extra) {
    const s = currentUrlState(extra);
    root.history.pushState({ mh: true }, '', buildHomeUrl(s, root.location.pathname));
    state.pushedDepth++;
  }
  function replaceUrl(extra) {
    const s = currentUrlState(extra);
    root.history.replaceState(Object.assign({}, root.history.state || {}, { mh: !!(root.history.state && root.history.state.mh) }), '', buildHomeUrl(s, root.location.pathname));
  }
  function onPopState() {
    if (!state.active) return;
    if (state.pushedDepth > 0) state.pushedDepth--;
    applyUrl({ fromPop: true });
  }
  function applyUrl({ fromPop } = {}) {
    const u = parseHomeUrl(root.location.search);
    if (u.normalized) root.history.replaceState(root.history.state, '', buildHomeUrl({ m: u.m, date: u.date, view: u.view, q: u.q }, root.location.pathname));
    const date = u.date || todayStr();
    if (u.view === 'search') {
      setOverlay('search', { q: u.q });
    } else if (u.view === 'day') {
      setOverlay('day', { date: u.date });
    } else if (u.view === 'month') {
      setOverlay('month');
    } else if (state.overlay) {
      setOverlay(null);
    }
    if (!u.view || u.view === 'month' || !fromPop) {
      state.selectedDate = u.date;
      state.weekStart = weekStartOf(date);
      state.visibleDate = null;
      setVisible(date);
      if (u.date || fromPop) jumpTo(date, {});
    }
  }

  /* ---------- scope・複数選択 ---------- */
  function syncScopeChips() {
    const scope = scopeValue();
    scopeEl.querySelectorAll('[data-scope]').forEach(b => {
      const on = (b.dataset.scope || '') === scope;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const sel = scopeEl.querySelector('#mh-select-toggle');
    const selOn = doc.body.classList.contains('selection-mode');
    sel.classList.toggle('is-active', selOn);
    sel.setAttribute('aria-pressed', String(selOn));
    sel.textContent = selOn ? '選択を終了' : '複数選択';
  }
  function onScopeClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.id === 'mh-select-toggle') {
      const on = doc.body.classList.toggle('selection-mode');
      if (!on && typeof root.clearEventSelection === 'function') root.clearEventSelection();
      // PCの複数選択ボタンの表示もそろえる
      const pcBtn = doc.getElementById('selection-mode-toggle');
      if (pcBtn) { pcBtn.setAttribute('aria-pressed', String(on)); pcBtn.textContent = on ? '複数選択を終了' : '複数選択'; }
      syncScopeChips();
      return;
    }
    if (!('scope' in btn.dataset)) return;
    const filters = filtersRef();
    if (!filters) return;
    filters.scope = btn.dataset.scope || '';
    // PC側のタブ表示も合わせる（幅を変えたときに状態がずれないように）
    doc.querySelectorAll('.scope-btn').forEach(b => b.classList.toggle('active', (b.dataset.scope || '') === filters.scope));
    if (typeof root.renderAll === 'function') root.renderAll(); // → wc:rendered で再描画
    else fullRender();
  }

  /* ---------- 既存ナビ（☰・フッター）の付け替え ---------- */
  function onNavCapture(e) {
    if (!state.active) return;
    const el = e.target.closest('[onclick*="scrollToSection"], a[href^="#today-section"], a[href^="#upcoming-section"], a[href^="#calendar-section"]');
    if (!el || rootEl.contains(el)) return;
    const src = (el.getAttribute('onclick') || '') + ' ' + (el.getAttribute('href') || '');
    let action = null;
    if (src.includes('today-section')) action = 'today';
    else if (src.includes('upcoming-section')) action = 'tomorrow';
    else if (src.includes('calendar-section')) action = 'month';
    else if (src.includes("'top'")) action = 'top';
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    doc.getElementById('mobile-nav')?.classList.remove('open');
    if (action === 'top') { root.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' }); return; }
    if (action === 'month') { openOverlay('month'); root.scrollTo({ top: Math.max(0, rootEl.offsetTop - headerHeight()), behavior: 'auto' }); return; }
    selectDate(action === 'today' ? todayStr() : addDays(todayStr(), 1), { push: true, source: 'nav' });
  }

  function onKeydown(e) {
    if (!state.active || e.key !== 'Escape' || !state.overlay) return;
    if (doc.getElementById('event-modal')?.classList.contains('active')) return; // 詳細モーダルを優先
    closeOverlay();
  }

  /* ---------- 描画の起点 ---------- */
  function fullRender() {
    if (!state.active) return;
    const today = todayStr();
    if (state.lastToday && state.lastToday !== today) {
      // 日付が変わった：範囲を今日基準に戻す
      state.from = today;
      state.to = addDays(today, MH_CONST.INITIAL_DAYS);
    }
    state.lastToday = today;
    lastSignature = signature();
    syncScopeChips();
    renderWeek();
    const keepY = root.scrollY;
    renderAgenda();
    root.scrollTo(0, keepY);
    if (state.overlay === 'month') renderMonth();
    else if (state.overlay === 'search') renderSearchResults();
    else if (state.overlay === 'day') renderDayView();
  }
  // 既存の renderAll は読み込み時に3回走る。内容が変わらないときは描き直さない（scope・日付・データ件数で判定）。
  let lastSignature = '';
  const signature = () => [scopeValue(), todayStr(), allEvents().length].join('|');
  let renderQueued = false;
  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      if (signature() === lastSignature) return;
      fullRender();
    });
  }

  let clockTimer = null;
  function clockTick() {
    if (!state.active || doc.hidden) return;
    if (todayStr() !== state.lastToday) { fullRender(); return; }
    const snap = todaySnapshot();
    if (snap !== state.todaySnapshot) rerenderToday();
  }

  /* ---------- 有効化・無効化 ---------- */
  function activate() {
    if (state.active || !ready()) return;
    if (!rootEl) buildShell();
    state.active = true;
    doc.body.classList.add('mh-active');
    rootEl.hidden = false;
    const today = todayStr();
    state.from = today;
    state.to = addDays(today, MH_CONST.INITIAL_DAYS);
    state.lastToday = today;
    state.weekStart = weekStartOf(today);
    state.visibleDate = today;
    const u = parseHomeUrl(root.location.search);
    if (u.date) {
      if (u.date < state.from) state.from = u.date;
      if (u.date > state.to) state.to = addDays(u.date, MH_CONST.EXTEND_DAYS);
    }
    lastSignature = signature();
    syncScopeChips();
    renderWeek();
    measure();
    renderAgenda();
    applyUrl({ fromPop: false });
    root.addEventListener('resize', measure);
    state.lastScrollY = root.scrollY;
    root.addEventListener('scroll', onScrollRaf, { passive: true });
    clockTimer = setInterval(clockTick, 30000);
  }
  function deactivate() {
    if (!state.active) return;
    state.active = false;
    setOverlay(null);
    setHeaderHidden(false);
    doc.body.classList.remove('mh-active');
    if (rootEl) rootEl.hidden = true;
    root.removeEventListener('scroll', onScrollRaf);
    root.removeEventListener('resize', measure);
    clearInterval(clockTimer);
    // PC表示へ戻るので、隠していた既存UIを最新状態で描き直す
    if (typeof root.renderAll === 'function') root.renderAll();
  }
  function onMediaChange() { if (MQ.matches) activate(); else deactivate(); }

  function boot() {
    if (!doc.getElementById('today-events')) return; // トップページ以外では何もしない
    doc.addEventListener('wc:rendered', () => { if (state.active) queueRender(); });
    doc.addEventListener('click', onNavCapture, true);
    doc.addEventListener('keydown', onKeydown);
    doc.addEventListener('visibilitychange', () => { if (!doc.hidden) clockTick(); });
    root.addEventListener('popstate', onPopState);
    if (MQ.addEventListener) MQ.addEventListener('change', onMediaChange); else MQ.addListener(onMediaChange);
    const start = () => { if (MQ.matches) activate(); };
    if (ready()) start();
    else {
      // 共通レイヤー（WC_UX.home）より先に読まれた場合に備えて待つ
      let tries = 0;
      const wait = setInterval(() => { if (ready() || ++tries > 50) { clearInterval(wait); start(); } }, 100);
    }
  }
  root.WC_MOBILE_HOME = { state, activate, deactivate, render: fullRender };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
