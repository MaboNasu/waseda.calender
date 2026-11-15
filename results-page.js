/**
 * results-page.js — 結果一覧ページ（/results.html）
 * EVENTS（events.js）と RESULTS（results.js）を読み、結果のあるイベントを新しい順に並べる。
 * 表示用の関数は results.js のもの（wcResultMarkHTML など）を使う。
 */
(function () {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function eventUrl(ev) {
    return '/event/' + encodeURIComponent(ev.id) + '.html';
  }

  function outcomesOf(ev) {
    return wcResultMatches(wcGetResult(ev.id)).map(function (m) { return m.outcome; });
  }

  function render() {
    var list = document.getElementById('results-list');
    var count = document.getElementById('results-count');
    if (!list || typeof EVENTS === 'undefined' || typeof wcEventsWithResults !== 'function') return;
    var kind = document.getElementById('results-filter-kind').value;
    var org = document.getElementById('results-filter-org').value;
    var outcome = document.getElementById('results-filter-outcome').value;
    var items = wcEventsWithResults(EVENTS).filter(function (ev) {
      var r = wcGetResult(ev.id);
      if (kind && r.kind !== kind) return false;
      if (org && ev.organizer !== org) return false;
      if (outcome && outcomesOf(ev).indexOf(outcome) < 0) return false;
      return true;
    });
    count.textContent = items.length + '件';
    if (!items.length) {
      list.innerHTML = '<p class="org-muted">条件に合う結果はありません。</p>';
      return;
    }
    list.innerHTML = items.map(function (ev) {
      var r = wcGetResult(ev.id);
      var source = r.sources[0];
      return '<a class="results-item" href="' + eventUrl(ev) + '">' +
        '<span class="results-item-date">' + esc(ev.date) + '</span>' +
        '<span class="results-item-main"><strong>' + esc(ev.title) + '</strong>' +
        '<span class="results-item-org">' + esc(ev.organizer || '') + '</span></span>' +
        '<span class="results-item-mark">' + wcResultMarkHTML(ev.id) + '</span>' +
        '</a>' +
        '<p class="results-item-source">出典: ' + esc(source.label || '') + '</p>';
    }).join('');
  }

  function setupOrgFilter() {
    var sel = document.getElementById('results-filter-org');
    if (!sel || typeof EVENTS === 'undefined') return;
    var names = {};
    wcEventsWithResults(EVENTS).forEach(function (ev) { if (ev.organizer) names[ev.organizer] = true; });
    Object.keys(names).sort(function (a, b) { return a.localeCompare(b, 'ja'); }).forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    setupOrgFilter();
    ['results-filter-kind', 'results-filter-org', 'results-filter-outcome'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', render);
    });
    render();
  });
})();
