/** Waseda Calendar final UX polish (2026-09)
 * Small follow-up fixes that depend on the common UX layer.
 */
(() => {
  'use strict';

  const onReady = (fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };

  const eventsSafe = () => {
    try { return typeof EVENTS !== 'undefined' ? EVENTS : []; } catch (_) { return []; }
  };
  const orgsSafe = () => {
    try { return typeof ORGANIZATIONS !== 'undefined' ? ORGANIZATIONS : []; } catch (_) { return []; }
  };

  function addDaysToDateStr(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  }

  function currentJstMinutes() {
    const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return jst.getUTCHours() * 60 + jst.getUTCMinutes();
  }

  function installTokyoDateConsistency() {
    if (typeof window.getTodayStr !== 'function') return;
    window.getWeekAheadStr = function getWeekAheadStrJst() {
      return addDaysToDateStr(getTodayStr(), 6);
    };
  }

  function polishNavigation() {
    document.querySelectorAll('.header-nav .nav-btn, .mobile-nav .nav-btn').forEach(item => {
      const text = item.textContent.trim();
      if (text.includes('近日開催') || text.includes('今週開催')) item.remove();
    });

    const path = location.pathname;
    const currentKind = path.includes('organizations') || /\/org\//.test(path) ? '団体'
      : path.includes('contact') ? '掲載'
      : path.includes('mypage') ? 'マイページ'
      : null;
    if (!currentKind) return;
    document.querySelectorAll('.header-nav .nav-btn, .mobile-nav .nav-btn').forEach(item => {
      if (item.textContent.includes(currentKind)) item.setAttribute('aria-current', 'page');
    });
  }

  function fixOrganizationEventHub(root = document) {
    root.querySelectorAll('.org-detail').forEach(detail => {
      const sections = [...detail.querySelectorAll('.org-related:not(.org-archive)')];
      const upcoming = sections.find(sec => {
        const heading = sec.querySelector('h2, h3');
        const text = heading?.textContent.trim();
        return text === '関連イベント' || text === '今後のイベント';
      });
      if (!upcoming) return;
      const heading = upcoming.querySelector('h2, h3');
      if (heading) heading.textContent = '今後のイベント';
      upcoming.classList.add('org-upcoming-primary');
      const header = detail.querySelector('.org-detail-header');
      const desc = detail.querySelector('.org-detail-desc');
      if (desc && upcoming.nextElementSibling !== desc) detail.insertBefore(upcoming, desc);
      else if (!desc && header && header.nextElementSibling !== upcoming) header.after(upcoming);
    });
  }

  function watchOrganizationEventHub() {
    const root = document.getElementById('organization-detail') || document.querySelector('.org-detail-page');
    if (!root) return;
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fixOrganizationEventHub(document);
      });
    });
    observer.observe(root, { childList: true, subtree: true });
    fixOrganizationEventHub();
  }

  function installMypagePolish() {
    if (typeof window.renderMypageFavoritesHTML === 'function') {
      window.renderMypageFavoritesHTML = function renderMypageFavoritesPolished(favorites) {
        const favoriteMap = new Map((favorites || []).map(f => [String(f.id), f]));
        const today = typeof getTodayStr === 'function' ? getTodayStr() : new Date().toISOString().slice(0, 10);
        const all = eventsSafe().filter(ev => ev.isPublished && favoriteMap.has(String(ev.id)));
        const upcoming = all.filter(ev => (ev.endDate || ev.date) >= today)
          .sort((a, b) => a.date.localeCompare(b.date) || String(a.startTime || '').localeCompare(String(b.startTime || '')));
        const past = all.filter(ev => (ev.endDate || ev.date) < today)
          .sort((a, b) => (b.endDate || b.date).localeCompare(a.endDate || a.date));
        const labels = { interested: '☆ 気になる', wantToGo: '↗ 行きたい', going: '✓ 参加予定' };

        const card = ev => {
          const fav = favoriteMap.get(String(ev.id)) || {};
          const label = labels[fav.reactionType] || '保存済み';
          return `<div class="mypage-favorite-wrap"><span class="reminder-reason-tag">${escapeHtml(label)}</span>${createEventCardHTML(ev, true)}</div>`;
        };
        const empty = favorites.length === 0
          ? '<div class="empty-state"><div class="empty-state-icon">📭</div><p>まだ保存したイベントがありません。イベント詳細から「気になる」「行きたい」「参加予定」を選べます。</p></div>'
          : '<div class="empty-state"><div class="empty-state-icon">📭</div><p>保存したイベントは、現在掲載されていないようです。</p></div>';
        const futureHtml = upcoming.length ? `<div class="events-grid">${upcoming.map(card).join('')}</div>` : empty;
        const pastHtml = past.length ? `<details class="mypage-past-events"><summary>過去の保存イベント（${past.length}件）</summary><div class="events-grid">${past.map(card).join('')}</div></details>` : '';
        return `<div class="mypage-section"><h2 class="section-title">保存したイベント</h2>${futureHtml}${pastHtml}</div>`;
      };
    }

    if (typeof window.renderMypageOrgFollowsHTML === 'function') {
      window.renderMypageOrgFollowsHTML = function renderMypageOrgFollowsPolished(followedOrgIds) {
        const followed = new Set((followedOrgIds || []).map(String));
        const orgs = orgsSafe().filter(org => followed.has(String(org.id)))
          .sort((a, b) => String(a.nameKana || a.name).localeCompare(String(b.nameKana || b.name), 'ja'));
        const body = orgs.length === 0
          ? '<div class="empty-state"><div class="empty-state-icon">📭</div><p>まだフォロー中の団体がありません。<a href="/organizations.html">公認団体</a>から気になる団体をフォローできます。</p></div>'
          : `<div class="org-follow-list">${orgs.map(org => `<article class="org-follow-card"><div><span class="org-genre">${escapeHtml(org.genre || 'その他')}</span><h3><a href="/org/${encodeURIComponent(org.id)}.html">${escapeHtml(org.name)}</a></h3></div><button type="button" class="btn btn-ghost btn-sm" onclick="handleMypageUnfollow('${escapeHtml(String(org.id))}', this)">フォロー解除</button></article>`).join('')}</div>`;
        return `<div class="mypage-section"><h2 class="section-title">フォロー中の団体</h2>${body}</div>`;
      };
    }
  }

  function installUpcomingTemporalSort() {
    if (typeof window.renderUpcomingEvents !== 'function' || typeof getWeekAheadStr !== 'function') return;
    const original = window.renderUpcomingEvents;
    window.renderUpcomingEvents = function renderUpcomingEventsPolished(allFiltered) {
      const ids = original(allFiltered);
      const el = document.getElementById('upcoming-events');
      if (!el || typeof getTodayStr !== 'function') return ids;
      const today = getTodayStr();
      const grid = el.querySelector('.events-grid');
      if (!grid) return ids;
      const cards = [...grid.querySelectorAll('.event-card')];
      const byId = new Map(eventsSafe().map(ev => [String(ev.id), ev]));
      const timeRank = ev => {
        if (!ev || ev.date !== today || !ev.startTime) return 1;
        const nowMin = currentJstMinutes();
        const [sh, sm] = ev.startTime.split(':').map(Number);
        const start = sh * 60 + sm;
        if (ev.endTime) {
          const [eh, em] = ev.endTime.split(':').map(Number);
          const end = eh * 60 + em;
          if (start <= nowMin && nowMin < end) return 0;
          if (end <= nowMin) return 3;
        }
        return start > nowMin ? 1 : 2;
      };
      cards.sort((a, b) => {
        const ea = byId.get(String(a.dataset.id));
        const eb = byId.get(String(b.dataset.id));
        return String(ea?.date || '').localeCompare(String(eb?.date || ''))
          || timeRank(ea) - timeRank(eb)
          || String(ea?.startTime || '99:99').localeCompare(String(eb?.startTime || '99:99'));
      }).forEach(card => grid.appendChild(card));
      return ids;
    };
  }

  function enhanceCalendarAria(root = document) {
    const title = document.getElementById('calendar-title')?.textContent || '';
    const match = title.match(/(\d{4})年\s*(\d{1,2})月/);
    const year = match ? Number(match[1]) : null;
    const month = match ? Number(match[2]) : null;

    root.querySelectorAll('.calendar-day:not(.other-month)').forEach(day => {
      const dayButton = day.querySelector('.day-num-clickable');
      const dayNumber = Number(day.querySelector('.day-num')?.textContent || 0);
      if (dayButton && year && month && dayNumber) {
        dayButton.setAttribute('aria-label', `${year}年${month}月${dayNumber}日のイベントを見る`);
      }
      const more = day.querySelector('.day-more');
      if (more && year && month && dayNumber) {
        more.setAttribute('aria-label', `${year}年${month}月${dayNumber}日の${more.textContent.trim()}を表示`);
      }
    });

    root.querySelectorAll('.day-event-chip, .event-bar').forEach(el => {
      const titleText = el.getAttribute('title') || el.textContent.trim();
      if (titleText) el.setAttribute('aria-label', `${titleText}の詳細を見る`);
    });
    root.querySelectorAll('.cal-list-event-item, .long-running-item').forEach(el => {
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      if (text) el.setAttribute('aria-label', `${text}の詳細を見る`);
    });
  }

  function watchCalendarAria() {
    const targets = ['calendar-grid', 'calendar-list', 'long-running-events']
      .map(id => document.getElementById(id)).filter(Boolean);
    if (!targets.length) return;
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        enhanceCalendarAria(document);
      });
    });
    targets.forEach(target => observer.observe(target, { childList: true, subtree: true }));
    enhanceCalendarAria(document);
  }

  onReady(() => {
    installTokyoDateConsistency();
    polishNavigation();
    fixOrganizationEventHub();
    watchOrganizationEventHub();
    installMypagePolish();
    installUpcomingTemporalSort();
    watchCalendarAria();

    if (document.getElementById('mypage-content') && window.WC?.currentUser && typeof renderMypageLoggedIn === 'function') {
      renderMypageLoggedIn();
    }
    if (document.getElementById('upcoming-events') && typeof renderAll === 'function') {
      try { renderAll(); } catch (_) {}
      requestAnimationFrame(() => enhanceCalendarAria(document));
    }
  });
})();
