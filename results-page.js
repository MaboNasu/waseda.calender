/**
 * results-page.js — /results.html（試合結果の一覧）
 *
 * events.js の EVENTS と results.js の RESULTS を読み、結果のあるイベントを新しい順に並べる。
 * 表示の部品（勝敗の印・出典リンクなど）は results.js の関数を使う。
 */
(function () {
  'use strict';

  const state = { kind: '', org: '', outcome: '' };

  function entries() {
    if (typeof EVENTS === 'undefined' || typeof wcResultEntries !== 'function') return [];
    return wcResultEntries(EVENTS);
  }

  function eventUrl(ev) {
    return `/event/${encodeURIComponent(ev.id)}.html`;
  }

  function matchesFilter(item) {
    const { ev, result } = item;
    if (state.kind && result.kind !== state.kind) return false;
    if (state.org && ev.organizer !== state.org) return false;
    if (state.outcome) {
      if (result.kind !== 'match') return false;
      const lines = wcResultLines(ev, result);
      if (!lines.some((l) => l.outcome === state.outcome)) return false;
    }
    return true;
  }

  function rowHTML(item) {
    const { ev, result } = item;
    const date = ev.endDate && ev.endDate !== ev.date ? `${ev.date}〜${ev.endDate}` : ev.date;
    const sources = result.sources.map((s) => `<a href="${wcResEscape(wcSafeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${wcResEscape(s.label || '出典')} ↗</a>`).join('　');
    const lines = result.kind === 'match' ? wcResultLines(ev, result).map(wcMatchLineHTML).join('') : '';
    return `<article class="results-row">
      <p class="results-row-meta"><span>${wcResEscape(date)}</span><span>${wcResEscape(ev.organizer || '')}</span></p>
      <h2 class="results-row-title"><a href="${eventUrl(ev)}">${wcResEscape(ev.title)}</a></h2>
      ${lines}
      ${result.award ? `<p class="result-award">🏆 ${wcResEscape(result.award)}</p>` : ''}
      ${result.summary ? `<p class="result-summary">${wcResEscape(result.summary)}</p>` : ''}
      <p class="result-sources">出典：${sources}</p>
    </article>`;
  }

  function render() {
    const list = document.getElementById('results-list');
    const count = document.getElementById('results-count');
    if (!list) return;
    const all = entries();
    const shown = all.filter(matchesFilter);
    if (count) count.textContent = all.length ? `${shown.length}件（全${all.length}件）` : '';
    list.innerHTML = shown.length
      ? shown.map(rowHTML).join('')
      : `<p class="org-muted">${all.length ? '条件に合う結果はありません。' : 'まだ掲載している結果はありません。結果は出典で確認できたものから順に追加します。'}</p>`;
  }

  function setupFilters() {
    const orgSelect = document.getElementById('results-org');
    if (orgSelect) {
      const orgs = [...new Set(entries().map((e) => e.ev.organizer).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
      orgSelect.insertAdjacentHTML('beforeend', orgs.map((o) => `<option value="${wcResEscape(o)}">${wcResEscape(o)}</option>`).join(''));
    }
    for (const [id, key] of [['results-kind', 'kind'], ['results-org', 'org'], ['results-outcome', 'outcome']]) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener('change', () => { state[key] = el.value; render(); });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupFilters();
    render();
  });
})();
