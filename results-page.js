/**
 * results-page.js — 出典確認済み結果の検索・閲覧用UI
 * データと詳細ページ向けの共通表示関数（results.js）は変更しない。
 */
(function () {
  'use strict';

  var PAGE_SIZE = 24;
  var state = { query: '', kind: '', org: '', outcome: '', sort: 'new', visible: PAGE_SIZE };
  var allEntries = [];

  function esc(value) { return wcResEscape(value); }
  function eventUrl(ev) { return '/event/' + encodeURIComponent(ev.id) + '.html'; }

  function normalize(value) {
    return String(value == null ? '' : value).normalize('NFKC').toLocaleLowerCase('ja');
  }

  function searchableText(item) {
    var ev = item.ev, result = item.result;
    var words = [ev.title, ev.organizer, result.award, result.summary, result.detail];
    if (result.kind === 'match') {
      wcResultLines(ev, result).forEach(function (line) {
        words.push(line.opponent, line.team, line.label, line.score, line.detail);
      });
    }
    return normalize(words.filter(Boolean).join(' '));
  }

  function isMatch(item) {
    var ev = item.ev, result = item.result;
    if (state.kind && result.kind !== state.kind) return false;
    if (state.org && ev.organizer !== state.org) return false;
    if (state.outcome) {
      if (result.kind !== 'match') return false;
      if (!wcResultLines(ev, result).some(function (line) { return line.outcome === state.outcome; })) return false;
    }
    var terms = normalize(state.query).trim().split(/\s+/).filter(Boolean);
    if (terms.length) {
      var searchable = searchableText(item);
      if (!terms.every(function (term) { return searchable.includes(term); })) return false;
    }
    return true;
  }

  function dateParts(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
  }

  function shortDate(value) {
    var p = dateParts(value);
    return p ? p.month + '月' + p.day + '日' : String(value || '');
  }

  function monthKey(value) {
    var p = dateParts(value);
    return p ? p.year + '-' + String(p.month).padStart(2, '0') : 'other';
  }

  function monthLabel(key) {
    var p = /^(\d{4})-(\d{2})$/.exec(key);
    return p ? Number(p[1]) + '年' + Number(p[2]) + '月' : 'その他';
  }

  function matchHTML(line) {
    var classes = { win: 'win', loss: 'loss', draw: 'draw' };
    var labels = { win: '勝ち', loss: '負け', draw: '引き分け' };
    var outcome = classes[line.outcome] || 'unknown';
    var parts = wcScoreParts(line.score);
    var score = parts
      ? '<strong>' + esc(parts[0]) + '</strong><span aria-hidden="true">–</span><strong>' + esc(parts[1]) + '</strong>'
      : '<strong>' + esc(line.score || '—') + '</strong>';
    var opponent = line.opponent || '対戦相手';
    var unit = [line.team, line.label].filter(Boolean).join(' / ');
    var spoken = ['早稲田', line.score || '', opponent, labels[line.outcome] || ''].join(' ');
    return '<div class="results-scoreboard results-scoreboard--' + outcome + '">'
      + (unit ? '<p class="results-match-unit">' + esc(unit) + '</p>' : '')
      + '<div class="results-score-main">'
      + '<span class="results-team-name results-team-home">早稲田</span>'
      + '<div class="results-score-numbers" aria-label="' + esc(spoken) + '">' + score + '</div>'
      + '<span class="results-team-name results-team-away">' + esc(opponent) + '</span>'
      + '<span class="results-outcome results-outcome--' + outcome + '">' + esc(labels[line.outcome] || '結果') + '</span>'
      + '</div>'
      + (line.detail ? '<p class="results-match-detail">' + esc(line.detail) + '</p>' : '')
      + '</div>';
  }

  function reportHTML(result) {
    return '<div class="results-report-feature">'
      + '<span class="results-report-kicker">大会・公演の結果</span>'
      + (result.detail ? '<span class="results-report-detail">' + esc(result.detail) + '</span>' : '')
      + '<strong class="results-report-award">' + esc(result.award || '結果・報告') + '</strong>'
      + '</div>';
  }

  function rowHTML(item) {
    var ev = item.ev, result = item.result;
    var date = ev.endDate && ev.endDate !== ev.date ? shortDate(ev.date) + '〜' + shortDate(ev.endDate) : shortDate(ev.date);
    var links = result.sources.map(function (source) {
      var safeUrl = wcSafeUrl(source.url);
      if (!safeUrl) return '';
      return '<a href="' + esc(safeUrl) + '" target="_blank" rel="noopener noreferrer">'
        + esc(source.label || '出典') + '<span aria-hidden="true"> ↗</span></a>';
    }).filter(Boolean).join('');

    var content = result.kind === 'match'
      ? wcResultLines(ev, result).map(matchHTML).join('')
      : reportHTML(result);

    var award = result.kind === 'match' && result.award
      ? '<p class="results-extra-award">大会成績：' + esc(result.award) + '</p>' : '';
    var summary = result.summary ? '<p class="results-item-summary">' + esc(result.summary) + '</p>' : '';
    return '<article class="results-item">'
      + '<div class="results-item-meta"><time datetime="' + esc(ev.date || '') + '">' + esc(date) + '</time>'
      + '<span class="results-item-org">' + esc(ev.organizer || '') + '</span></div>'
      + '<h4 class="results-item-title"><a href="' + eventUrl(ev) + '">' + esc(ev.title) + '</a></h4>'
      + content + award + summary
      + '<div class="results-item-footer"><div class="results-item-sources"><span>出典</span>' + links + '</div>'
      + '<a class="results-detail-link" href="' + eventUrl(ev) + '">イベント詳細 <span aria-hidden="true">→</span></a>'
      + '</div>'
      + '</article>';
  }

  function hasActiveFilters() {
    return !!(state.query.trim() || state.kind || state.org || state.outcome || state.sort !== 'new');
  }

  function matchingEntries() {
    var items = allEntries.filter(isMatch);
    if (state.sort === 'old') items.reverse();
    return items;
  }

  function render() {
    var list = document.getElementById('results-list');
    var count = document.getElementById('results-count');
    var moreWrap = document.getElementById('results-more-wrap');
    var progress = document.getElementById('results-progress');
    var clearBtn = document.getElementById('results-clear');
    if (!list) return;

    var matched = matchingEntries();
    var visible = matched.slice(0, state.visible);
    if (count) {
      count.textContent = matched.length === allEntries.length
        ? allEntries.length + '件'
        : matched.length + '件 / 全' + allEntries.length + '件';
    }
    if (clearBtn) clearBtn.hidden = !hasActiveFilters();
    if (moreWrap) moreWrap.hidden = visible.length >= matched.length;
    if (progress) progress.textContent = visible.length + '件を表示中（全' + matched.length + '件）';

    if (!visible.length) {
      list.innerHTML = '<div class="results-empty"><p class="results-empty-title">'
        + (allEntries.length ? '条件に合う結果がありません' : 'まだ掲載している結果はありません')
        + '</p><p>' + (allEntries.length ? 'キーワードや絞り込み条件を変えてみてください。' : '出典を確認できた結果から順次掲載します。')
        + '</p>' + (hasActiveFilters() ? '<button type="button" class="results-empty-reset">条件をクリア</button>' : '') + '</div>';
      return;
    }

    var groups = [];
    visible.forEach(function (item) {
      var key = monthKey(item.ev.date);
      var last = groups[groups.length - 1];
      if (!last || last.key !== key) {
        last = { key: key, items: [] };
        groups.push(last);
      }
      last.items.push(item);
    });
    list.innerHTML = groups.map(function (group) {
      return '<section class="results-month" aria-label="' + esc(monthLabel(group.key)) + '">'
        + '<h3 class="results-month-heading">' + esc(monthLabel(group.key)) + '</h3>'
        + '<div class="results-month-items">' + group.items.map(rowHTML).join('') + '</div>'
        + '</section>';
    }).join('');
  }

  function filterChanged() { state.visible = PAGE_SIZE; render(); }

  function clearFilters() {
    state.query = ''; state.kind = ''; state.org = ''; state.outcome = ''; state.sort = 'new';
    ['results-search', 'results-kind', 'results-org', 'results-outcome', 'results-sort'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    var sort = document.getElementById('results-sort');
    if (sort) sort.value = 'new';
    filterChanged();
    var search = document.getElementById('results-search');
    if (search) search.focus();
  }

  function setup() {
    allEntries = (typeof EVENTS !== 'undefined' && typeof wcResultEntries === 'function')
      ? wcResultEntries(EVENTS) : [];
    var total = document.getElementById('results-total');
    if (total) total.textContent = allEntries.length + '件の確認済み結果を掲載中';

    var orgSelect = document.getElementById('results-org');
    if (orgSelect) {
      var orgs = Array.from(new Set(allEntries.map(function (item) { return item.ev.organizer; }).filter(Boolean)));
      orgs.sort(function (a, b) { return a.localeCompare(b, 'ja'); });
      orgs.forEach(function (name) {
        var option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        orgSelect.appendChild(option);
      });
    }
    var input = document.getElementById('results-search');
    if (input) input.addEventListener('input', function () { state.query = input.value; filterChanged(); });
    [['results-kind', 'kind'], ['results-org', 'org'], ['results-outcome', 'outcome'], ['results-sort', 'sort']].forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (el) el.addEventListener('change', function () { state[pair[1]] = el.value; filterChanged(); });
    });
    var form = document.getElementById('results-filter-form');
    if (form) form.addEventListener('submit', function (ev) { ev.preventDefault(); });
    var clear = document.getElementById('results-clear');
    if (clear) clear.addEventListener('click', clearFilters);
    var more = document.getElementById('results-more');
    if (more) more.addEventListener('click', function () { state.visible += PAGE_SIZE; render(); });
    var list = document.getElementById('results-list');
    if (list) list.addEventListener('click', function (ev) {
      if (ev.target.closest('.results-empty-reset')) clearFilters();
    });
    render();
  }

  document.addEventListener('DOMContentLoaded', setup);
})();
