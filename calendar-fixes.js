/** Waseda Calendar calendar rendering hardening (2026-09)
 * Keeps desktop month-grid overflow counts idempotent and aligns single-day
 * events below a consistent multi-day-bar zone for each week.
 */
(() => {
  'use strict';

  const onReady = (fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };

  function getCalendarContext() {
    const title = document.getElementById('calendar-title')?.textContent || '';
    const match = title.match(/(\d{4})年\s*(\d{1,2})月/);
    return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
  }

  function normalizeMoreButton(day, context) {
    const more = day.querySelector('.day-more');
    if (!more) return;

    // script.js is the single source of truth for the hidden count. Capture that
    // native value once, then remove .day-more so ux-polish cannot add to it again.
    const match = more.textContent.match(/(?:他|\+)(\d+)件/);
    const hidden = match ? Number(match[1]) : 0;
    more.dataset.hiddenCount = String(hidden);
    more.classList.remove('day-more');
    more.classList.add('calendar-more-fixed');

    const text = hidden > 0 ? `+${hidden}件` : '';
    if (more.textContent !== text) more.textContent = text;

    const dayNumber = Number(day.querySelector('.day-num')?.textContent || 0);
    if (context && dayNumber && hidden > 0) {
      more.setAttribute('aria-label', `${context.year}年${context.month}月${dayNumber}日の残り${hidden}件のイベントを表示`);
    }
  }

  function alignWeekRows(week) {
    const dayEventAreas = [...week.querySelectorAll('.calendar-day:not(.other-month) .day-events')];
    if (!dayEventAreas.length) return;

    // script.js calculates the required bar clearance per column. Use the largest
    // clearance for all seven days so single-day chips share one horizontal baseline.
    const maxMargin = dayEventAreas.reduce((max, area) => {
      const value = Number.parseFloat(area.style.marginTop || '0');
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0);

    dayEventAreas.forEach(area => {
      const next = maxMargin > 0 ? `${maxMargin}px` : '';
      if (area.style.marginTop !== next) area.style.marginTop = next;
    });
  }

  function normalizeCalendarGrid(root = document) {
    const grid = root.querySelector?.('#calendar-grid') || document.getElementById('calendar-grid');
    if (!grid) return;

    const context = getCalendarContext();

    // Defensive cleanup in case an older cached ux-polish ran before this file.
    grid.querySelectorAll('.calendar-chip-overflow').forEach(chip => chip.classList.remove('calendar-chip-overflow'));
    grid.querySelectorAll('.calendar-day').forEach(day => normalizeMoreButton(day, context));
    grid.querySelectorAll('.calendar-week').forEach(alignWeekRows);
  }

  function watchCalendarGrid() {
    const grid = document.getElementById('calendar-grid');
    if (!grid || window.__wcCalendarGridFixInstalled) return;
    window.__wcCalendarGridFixInstalled = true;

    // This observer is intentionally synchronous. It is loaded before ux-polish.js,
    // so native .day-more nodes are normalized before the later compacting observer
    // can mutate their counts.
    const observer = new MutationObserver(() => normalizeCalendarGrid(document));
    observer.observe(grid, { childList: true, subtree: true });
    normalizeCalendarGrid(document);
  }

  onReady(watchCalendarGrid);
})();
