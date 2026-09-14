/* Waseda Calendar cross-site UX improvements (2026-09)
   Loaded after each page's existing scripts via auth-ui.js. */
(() => {
  'use strict';

  const WC_UX = window.WC_UX = window.WC_UX || {};
  const onReady = fn => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };

  function getAllEventsSafe() {
    try { return typeof EVENTS !== 'undefined' ? EVENTS : []; } catch (_) { return []; }
  }
  function getAllOrgsSafe() {
    try { return typeof ORGANIZATIONS !== 'undefined' ? ORGANIZATIONS : []; } catch (_) { return []; }
  }
  function findEventById(id) {
    return getAllEventsSafe().find(ev => String(ev.id) === String(id)) || null;
  }
  function currentEventFromUrl() {
    const params = new URLSearchParams(location.search);
    const pathMatch = location.pathname.match(/\/event\/([^/]+)\.html$/);
    const id = params.get('id') || (pathMatch ? decodeURIComponent(pathMatch[1]) : null);
    return id ? findEventById(id) : null;
  }
  function safeToday() {
    try { return typeof getTodayStr === 'function' ? getTodayStr() : new Date().toISOString().slice(0, 10); }
    catch (_) { return new Date().toISOString().slice(0, 10); }
  }

  /* ---------- Global navigation / accessibility ---------- */
  function addSkipLink() {
    if (document.querySelector('.skip-link')) return;
    const main = document.querySelector('main') || document.querySelector('#top');
    if (!main) return;
    if (!main.id) main.id = 'main-content';
    const a = document.createElement('a');
    a.className = 'skip-link';
    a.href = `#${main.id}`;
    a.textContent = '本文へスキップ';
    document.body.prepend(a);
  }

  function simplifyNavigation() {
    document.querySelectorAll('.header-nav, .mobile-nav').forEach(nav => {
      [...nav.querySelectorAll('.nav-btn')].forEach(item => {
        const text = item.textContent.trim();
        if (text.includes('今週開催')) { item.remove(); return; }
        if (text.includes('本日のイベント')) item.textContent = '今日';
        if (text === '公認団体') item.textContent = '団体';
        if (text.includes('掲載依頼') || text.includes('マイページ')) item.classList.add('nav-secondary');
      });
    });
  }

  function makeClickableCalendarKeyboardFriendly(root = document) {
    const selector = '.day-event-chip, .day-more, .event-bar, .cal-list-event-item, .long-running-item, .day-num-clickable';
    root.querySelectorAll(selector).forEach(el => {
      if (el.dataset.keyboardReady === '1') return;
      el.dataset.keyboardReady = '1';
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.click();
        }
      });
    });
  }

  function watchDynamicAccessibility() {
    makeClickableCalendarKeyboardFriendly();
    const targets = ['calendar-grid', 'calendar-list', 'long-running-events', 'today-events', 'upcoming-events']
      .map(id => document.getElementById(id)).filter(Boolean);
    if (!targets.length) return;
    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        m.addedNodes.forEach(node => {
          if (node.nodeType === 1) makeClickableCalendarKeyboardFriendly(node);
        });
      }
      updateReactionSummaryVisibility();
    });
    targets.forEach(t => observer.observe(t, { childList: true, subtree: true }));
  }

  /* ---------- Home page hierarchy ---------- */
  function sortTodayByUsefulness(events) {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const toMinutes = value => {
      if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
      const [h, m] = value.split(':').map(Number);
      return h * 60 + m;
    };
    const rank = ev => {
      const start = toMinutes(ev.startTime);
      const end = toMinutes(ev.endTime);
      if (start === null) return 2;
      if (start > nowMinutes) return 1;
      if (end !== null && end <= nowMinutes) return 3;
      return 0;
    };
    return [...events].sort((a, b) => rank(a) - rank(b)
      || String(a.startTime || '99:99').localeCompare(String(b.startTime || '99:99'))
      || String(a.title || '').localeCompare(String(b.title || ''), 'ja'));
  }

  function installHomeRenderOverrides() {
    if (typeof window.renderTodayEvents === 'function' && typeof window.createEventCardHTML === 'function') {
      window.renderTodayEvents = function renderTodayEventsUx(allFiltered) {
        const el = document.getElementById('today-events');
        if (!el) return [];
        const today = getTodayStr();
        const source = allFiltered || getFilteredEvents();
        const filtered = sortTodayByUsefulness(source.filter(ev => isEventOnDate(ev, today)));
        const countEl = document.getElementById('today-count');
        if (countEl) countEl.textContent = `${filtered.length}件`;
        el.innerHTML = filtered.length === 0
          ? `<div class="empty-state"><div class="empty-state-icon">📭</div><p>本日のイベントは0件です。</p><p class="empty-state-action"><button type="button" class="btn btn-ghost btn-sm" onclick="scrollToSection('upcoming-section')">今週のイベントを見る</button></p></div>`
          : eventsGridWithShowMoreHTML(filtered.map(ev => createEventCardHTML(ev, false)).join(''), 'today-events');
        return filtered.map(ev => ev.id);
      };
    }

    if (typeof window.renderUpcomingEvents === 'function') {
      window.renderUpcomingEvents = function renderUpcomingEventsUx(allFiltered) {
        const el = document.getElementById('upcoming-events');
        if (!el) return [];
        const today = getTodayStr();
        const weekAhead = getWeekAheadStr();
        const source = allFiltered || getFilteredEvents();
        const inWindow = source.filter(ev => (ev.date > today || isEventOnDate(ev, today)) && ev.date <= weekAhead);
        const regular = inWindow.filter(ev => !isLongRunningEvent(ev)).sort((a, b) => a.date.localeCompare(b.date));
        const longRunning = source.filter(ev => isLongRunningEvent(ev) && ev.date <= weekAhead && getEventEnd(ev) >= today)
          .sort((a, b) => getEventEnd(a).localeCompare(getEventEnd(b)) || a.date.localeCompare(b.date));
        const countEl = document.getElementById('upcoming-count');
        if (countEl) countEl.textContent = `${regular.length}件`;
        el.innerHTML = regular.length === 0
          ? emptyStateHTML('今週開催のイベントは0件です。')
          : eventsGridWithShowMoreHTML(regular.map(ev => createEventCardHTML(ev, true)).join(''), 'upcoming-events');
        renderUpcomingLongRunning(longRunning);
        return [...regular, ...longRunning].map(ev => ev.id);
      };
    }

    if (typeof window.organizerHTML === 'function') {
      window.organizerHTML = function organizerHtmlUx(ev) {
        const text = escapeHtml(ev.organizer || '—');
        if (!ev.orgId) return text;
        return `<a href="/org/${encodeURIComponent(ev.orgId)}.html" class="organizer-link">${text}</a>`;
      };
    }

    if (typeof window.refreshLiveReactionCounts === 'function' && !WC_UX.reactionRefreshWrapped) {
      WC_UX.reactionRefreshWrapped = true;
      const originalRefresh = window.refreshLiveReactionCounts;
      window.refreshLiveReactionCounts = async function refreshLiveReactionCountsUx(ids) {
        await originalRefresh(ids);
        updateReactionSummaryVisibility();
      };
    }
  }

  function updateReactionSummaryVisibility(root = document) {
    root.querySelectorAll('.reaction-summary').forEach(summary => {
      const total = [...summary.querySelectorAll('.reaction-count')]
        .reduce((sum, el) => sum + (Number(el.textContent) || 0), 0);
      summary.dataset.empty = total <= 0 ? 'true' : 'false';
    });
  }

  function renderUpcomingLongRunning(events) {
    const section = document.getElementById('upcoming-section');
    if (!section) return;
    let wrap = document.getElementById('upcoming-long-running');
    if (!events.length) { if (wrap) wrap.remove(); return; }
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'upcoming-long-running';
      wrap.className = 'upcoming-long-running';
      const body = document.getElementById('upcoming-body');
      (body || section.querySelector('.container') || section).appendChild(wrap);
    }
    const items = events.slice(0, 5).map(ev => {
      const range = `${formatShortDate(ev.date)}〜${formatShortDate(getEventEnd(ev))}`;
      return `<button type="button" class="upcoming-long-running-item" onclick="openModal('${escapeHtml(String(ev.id))}')"><span>${escapeHtml(ev.title)}</span><span class="upcoming-long-running-range">${escapeHtml(range)}</span></button>`;
    }).join('');
    wrap.innerHTML = `<h3>開催中の展示・長期企画</h3><div class="upcoming-long-running-list">${items}</div>`;
  }

  function homeDomEnhancements() {
    if (!document.querySelector('.hero')) return;
    const heroCtas = document.querySelectorAll('.hero-cta > *');
    if (heroCtas[0]) heroCtas[0].textContent = '📅 今日行けるイベントを見る';
    if (heroCtas[1]) heroCtas[1].textContent = '🗓 カレンダーから探す';
    if (heroCtas[2] && heroCtas[2].getAttribute('href') === 'contact.html') heroCtas[2].remove();

    const heroSub = document.querySelector('.hero-sub');
    if (heroSub && !document.querySelector('.hero-live-count')) {
      const today = safeToday();
      const published = getAllEventsSafe().filter(ev => ev.isPublished);
      const todayCount = typeof isEventOnDate === 'function' ? published.filter(ev => isEventOnDate(ev, today)).length : 0;
      let weekCount = 0;
      try {
        const weekAhead = getWeekAheadStr();
        weekCount = published.filter(ev => (ev.date > today || isEventOnDate(ev, today)) && ev.date <= weekAhead && !isLongRunningEvent(ev)).length;
      } catch (_) {}
      const p = document.createElement('p');
      p.className = 'hero-live-count';
      p.innerHTML = `今日は <strong>${todayCount}件</strong>・この先7日間は <strong>${weekCount}件</strong> のイベントがあります。`;
      heroSub.after(p);
    }

    document.querySelectorAll('.scope-btn').forEach(btn => {
      if (btn.dataset.scope === 'circle') btn.textContent = 'イベント';
    });

    const todayToggle = document.getElementById('today-toggle');
    const todayBody = document.getElementById('today-body');
    if (todayToggle && todayBody) {
      todayToggle.setAttribute('aria-expanded', 'true');
      todayBody.hidden = false;
      if (typeof collapseGridToOneRow === 'function') requestAnimationFrame(() => collapseGridToOneRow(document.getElementById('today-events')));
    }

    const recommendation = document.querySelector('.recommend-entry');
    if (recommendation) {
      try {
        if (typeof RECOMMEND_QUESTIONS !== 'undefined' && RECOMMEND_QUESTIONS.length > 3) RECOMMEND_QUESTIONS.splice(3);
      } catch (_) {}
      const title = recommendation.querySelector('.recommend-entry-title');
      const desc = recommendation.querySelector('.recommend-entry-desc');
      const cta = recommendation.querySelector('.recommend-entry-cta');
      if (title) title.innerHTML = '迷った？ 今日、何する？<span class="beta-badge">β</span>';
      if (desc) desc.textContent = '3つの質問で、条件に合うイベントを3件選びます';
      if (cta && cta.firstChild) cta.firstChild.textContent = '3問で選ぶ ';
      const todayBodyEl = document.getElementById('today-body');
      if (todayBodyEl) todayBodyEl.after(recommendation);
    }

    wrapDisplaySettings();
    addSelectionModeToggle();
  }

  function wrapDisplaySettings() {
    document.querySelectorAll('.density-toggle').forEach(toggle => {
      if (toggle.closest('.display-settings')) return;
      const details = document.createElement('details');
      details.className = 'display-settings';
      details.innerHTML = '<summary>表示設定</summary>';
      toggle.parentNode.insertBefore(details, toggle);
      details.appendChild(toggle);
    });

    const orgToggle = document.querySelector('.org-columns-toggle');
    if (orgToggle && !orgToggle.closest('.display-settings')) {
      const group = orgToggle.closest('.filter-group');
      if (group) {
        const label = group.querySelector('label');
        const details = document.createElement('details');
        details.className = 'display-settings';
        details.innerHTML = '<summary>表示サイズ</summary>';
        group.insertBefore(details, orgToggle);
        details.appendChild(orgToggle);
        if (label) label.hidden = true;
      }
    }
  }

  function addSelectionModeToggle() {
    if (document.getElementById('selection-mode-toggle')) return;
    const scope = document.querySelector('.scope-toggle');
    if (!scope) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'selection-mode-toggle';
    btn.className = 'btn btn-ghost btn-sm selection-mode-toggle';
    btn.setAttribute('aria-pressed', 'false');
    btn.textContent = '複数選択';
    btn.addEventListener('click', () => {
      const active = document.body.classList.toggle('selection-mode');
      btn.setAttribute('aria-pressed', String(active));
      btn.textContent = active ? '複数選択を終了' : '複数選択';
      if (!active && typeof clearEventSelection === 'function') clearEventSelection();
    });
    scope.appendChild(btn);
  }

  /* ---------- Event detail/modal semantics ---------- */
  function installModalEnhancement() {
    if (typeof window.openModal !== 'function' || WC_UX.modalWrapped) return;
    WC_UX.modalWrapped = true;
    const originalOpenModal = window.openModal;
    window.openModal = function openModalUx(eventId) {
      originalOpenModal(eventId);
      const ev = findEventById(eventId);
      if (ev) enhanceModalForEvent(ev);
    };
  }

  function enhanceModalForEvent(ev) {
    const modal = document.getElementById('event-modal');
    if (!modal) return;
    modal.classList.toggle('is-schedule', ev.scope === 'schedule');
    const desc = document.getElementById('modal-desc-section');
    const share = document.getElementById('modal-share-actions');
    if (desc && share && share.parentNode === desc.parentNode) share.parentNode.insertBefore(desc, share);

    if (ev.scope === 'schedule') {
      const tags = document.getElementById('modal-tags');
      if (tags) tags.querySelectorAll('.tag-free, .tag-paid, .tag-unknown').forEach(el => el.remove());
      const reactions = document.getElementById('modal-reactions');
      if (reactions) reactions.innerHTML = '';
      document.querySelectorAll('#modal-detail-content .modal-detail-item').forEach(item => {
        const label = item.querySelector('.modal-detail-label')?.textContent.trim();
        if (label === '参加費') item.remove();
        if (label === '場所' && !ev.location) item.remove();
      });
      if (!modal.querySelector('.schedule-detail-note')) {
        const note = document.createElement('p');
        note.className = 'schedule-detail-note';
        note.textContent = 'これは授業期間・休業・式典などの学事日程です。参加型イベントではありません。';
        document.getElementById('modal-detail-content')?.after(note);
      }
    } else {
      modal.querySelector('.schedule-detail-note')?.remove();
    }
  }

  function enhanceEventDetailPage() {
    const wrap = document.getElementById('event-detail');
    if (!wrap) return;
    const ev = currentEventFromUrl();
    if (!ev) return;
    wrap.classList.toggle('is-schedule', ev.scope === 'schedule');

    const body = wrap.querySelector('.modal-body');
    const descBlock = body?.querySelector('.modal-desc-label')?.parentElement;
    const reaction = body?.querySelector('.reaction-panel');
    const share = body?.querySelector('.modal-share-actions');
    if (body && descBlock) {
      const anchor = reaction || share;
      if (anchor) body.insertBefore(descBlock, anchor);
    }

    wrap.querySelectorAll('.event-secondary-info .modal-detail-item').forEach(item => {
      const label = item.querySelector('.modal-detail-label')?.textContent.trim();
      if (label === '主催団体' && ev.orgId) {
        const value = item.querySelector('.modal-detail-value');
        if (value) value.innerHTML = `<a class="organizer-link" href="/org/${encodeURIComponent(ev.orgId)}.html">${escapeHtml(ev.organizer || '団体詳細')}</a>`;
      }
    });

    if (ev.scope === 'schedule') {
      wrap.querySelector('.reaction-panel')?.remove();
      const participation = wrap.querySelector('.event-participation-box');
      if (participation) {
        participation.querySelector('.event-participation-title')?.remove();
        participation.querySelector('.event-participation-chips')?.remove();
        if (!participation.querySelector('.schedule-detail-note')) {
          const note = document.createElement('p');
          note.className = 'schedule-detail-note';
          note.textContent = 'これは授業期間・休業・式典などの学事日程です。参加型イベントではありません。';
          participation.prepend(note);
        }
      }
      wrap.querySelectorAll('.event-hero-row').forEach(row => {
        if (!ev.location && row.textContent.includes('場所は未定')) row.remove();
      });
    }
  }

  /* ---------- Organization UX / followed-event bug ---------- */
  function installOrgEnhancements() {
    if (typeof window.collectFollowedOrgEventIds === 'function') {
      window.collectFollowedOrgEventIds = function collectFollowedOrgEventIdsUx(followedOrgIds) {
        const followed = new Set((followedOrgIds || []).map(String));
        const orgs = getAllOrgsSafe().filter(org => followed.has(String(org.id)));
        const names = new Set(orgs.map(org => String(org.name || '').trim()).filter(Boolean));
        const ids = new Set();
        orgs.forEach(org => (Array.isArray(org.relatedEventIds) ? org.relatedEventIds : []).forEach(id => ids.add(String(id))));
        getAllEventsSafe().forEach(ev => {
          if ((ev.orgId && followed.has(String(ev.orgId))) || (ev.organizer && names.has(String(ev.organizer).trim()))) ids.add(String(ev.id));
        });
        return ids;
      };
    }

    if (typeof window.renderMypageFavoritesHTML === 'function') {
      window.renderMypageFavoritesHTML = function renderMypageFavoritesHTMLUx(favorites) {
        const favoriteMap = new Map((favorites || []).map(f => [String(f.id), f]));
        const events = getAllEventsSafe().filter(ev => ev.isPublished && favoriteMap.has(String(ev.id)))
          .sort((a, b) => a.date.localeCompare(b.date));
        const labels = { interested: '☆ 気になる', wantToGo: '↗ 行きたい', going: '✓ 参加予定' };
        const body = events.length === 0
          ? `<div class="empty-state"><div class="empty-state-icon">📭</div><p>${favorites.length === 0 ? 'まだ保存したイベントがありません。イベント詳細から「気になる」「行きたい」「参加予定」を選べます。' : '保存したイベントは、現在掲載されていないようです。'}</p></div>`
          : `<div class="events-grid">${events.map(ev => {
              const fav = favoriteMap.get(String(ev.id)) || {};
              const label = labels[fav.reactionType] || '保存済み';
              return `<div class="mypage-favorite-wrap"><span class="reminder-reason-tag">${escapeHtml(label)}</span>${createEventCardHTML(ev, true)}</div>`;
            }).join('')}</div>`;
        return `<div class="mypage-section"><h2 class="section-title">保存したイベント</h2>${body}</div>`;
      };
    }
  }

  function enhanceOrgDetail(root = document) {
    root.querySelectorAll('.org-detail').forEach(detail => {
      const upcoming = [...detail.querySelectorAll('.org-related')].find(sec => {
        const text = sec.querySelector('h3')?.textContent.trim();
        return text === '関連イベント' || text === '今後のイベント';
      });
      if (!upcoming) return;
      upcoming.querySelector('h3').textContent = '今後のイベント';
      upcoming.classList.add('org-upcoming-primary');
      const header = detail.querySelector('.org-detail-header');
      const desc = detail.querySelector('.org-detail-desc');
      if (desc && upcoming.nextElementSibling !== desc) detail.insertBefore(upcoming, desc);
      else if (!desc && header && header.nextElementSibling !== upcoming) header.after(upcoming);
    });
  }

  function watchOrgDetail() {
    const targets = document.querySelectorAll('.org-detail');
    if (!targets.length) return;
    targets.forEach(target => {
      let scheduled = false;
      const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          enhanceOrgDetail(target.parentElement || document);
        });
      });
      observer.observe(target, { childList: true, subtree: false });
    });
    enhanceOrgDetail();
  }

  /* ---------- Contact form usability / a11y ---------- */
  function installContactEnhancements() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    if (typeof window.validateForm === 'function' && !WC_UX.validateWrapped) {
      WC_UX.validateWrapped = true;
      const originalValidate = window.validateForm;
      window.validateForm = function validateFormUx(formEl) {
        const result = originalValidate(formEl);
        const entry = typeof getEntryChoice === 'function' ? getEntryChoice() : '';
        if (entry === 'new-org' || entry === 'returning-org') {
          const err = document.getElementById('error-message');
          const field = formEl.elements['message'];
          if (err) err.textContent = '';
          if (field) field.classList.remove('invalid');
          const remainingErrors = [...document.querySelectorAll('.field-error')].some(el => el.textContent.trim());
          return !remainingErrors;
        }
        return result;
      };
    }

    if (typeof window.showResult === 'function' && !WC_UX.showResultWrapped) {
      WC_UX.showResultWrapped = true;
      const originalShowResult = window.showResult;
      window.showResult = function showResultUx(type, message) {
        originalShowResult(type, message);
        if (type === 'error') setTimeout(focusFirstInvalidField, 30);
      };
    }

    const updateMessageLabel = () => {
      const entry = typeof getEntryChoice === 'function' ? getEntryChoice() : '';
      const textarea = document.getElementById('contact-message');
      const label = textarea?.closest('.form-group')?.querySelector('.form-label');
      if (!textarea || !label) return;
      if (entry === 'new-org' || entry === 'returning-org') {
        label.textContent = '補足（任意）';
        textarea.placeholder = 'イベントについて補足したい内容があればご記入ください。';
      } else {
        label.innerHTML = 'お問い合わせ内容<span class="required-mark">必須</span>';
        textarea.placeholder = 'お問い合わせ内容をご記入ください。';
      }
    };
    document.querySelectorAll('input[name="entryChoice"]').forEach(radio => radio.addEventListener('change', updateMessageLabel));
    updateMessageLabel();

    const errorObserver = new MutationObserver(syncFormAria);
    document.querySelectorAll('.field-error').forEach(el => errorObserver.observe(el, { childList: true, characterData: true, subtree: true }));
    syncFormAria();
  }

  function syncFormAria() {
    document.querySelectorAll('.field-error[id^="error-"]').forEach(error => {
      const key = error.id.replace('error-', '');
      const candidates = [
        document.querySelector(`[name="${CSS.escape(key)}"]`),
        document.getElementById(key),
        document.getElementById(`contact-${key}`),
        document.getElementById(`event-${key}`)
      ].filter(Boolean);
      const field = candidates[0];
      if (!field) return;
      const hasError = !!error.textContent.trim();
      field.setAttribute('aria-invalid', hasError ? 'true' : 'false');
      if (hasError) field.setAttribute('aria-describedby', error.id);
      else if (field.getAttribute('aria-describedby') === error.id) field.removeAttribute('aria-describedby');
    });
  }

  function focusFirstInvalidField() {
    syncFormAria();
    const first = document.querySelector('[aria-invalid="true"]');
    if (!first) return;
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => first.focus({ preventScroll: true }), 250);
  }

  function registerEngagementSignals() {
    document.addEventListener('click', e => {
      if (e.target.closest('.reaction-btn, .org-follow-btn, .event-participation-cta .btn')) {
        window.dispatchEvent(new CustomEvent('wc-engaged'));
      }
    });
  }

  /* ---------- Boot ---------- */
  installHomeRenderOverrides();
  installModalEnhancement();
  installOrgEnhancements();

  onReady(() => {
    addSkipLink();
    simplifyNavigation();
    homeDomEnhancements();
    enhanceEventDetailPage();
    wrapDisplaySettings();
    watchDynamicAccessibility();
    watchOrgDetail();
    installContactEnhancements();
    registerEngagementSignals();
    updateReactionSummaryVisibility();

    if (document.getElementById('today-events') && typeof renderAll === 'function') {
      try { renderAll(); } catch (_) {}
      const todayToggle = document.getElementById('today-toggle');
      const todayBody = document.getElementById('today-body');
      if (todayToggle && todayBody) {
        todayToggle.setAttribute('aria-expanded', 'true');
        todayBody.hidden = false;
        if (typeof collapseGridToOneRow === 'function') requestAnimationFrame(() => collapseGridToOneRow(document.getElementById('today-events')));
      }
    }
  });
})();
