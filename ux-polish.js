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

  function polishSelectionControl() {
    const btn = document.getElementById('selection-mode-toggle');
    if (!btn) return;
    const settings = document.querySelector('#today-section .display-settings') || document.querySelector('.display-settings');
    if (settings && btn.parentElement !== settings) settings.appendChild(btn);
    btn.classList.add('selection-tool-btn');

    const sync = () => {
      const active = document.body.classList.contains('selection-mode');
      btn.textContent = active ? '選択モードを終了' : '📅 複数イベントをまとめて追加';
      btn.setAttribute('aria-label', active ? '複数イベントの選択モードを終了' : '複数のイベントをまとめてカレンダーに追加');
      if (settings && active) settings.open = false;

      let hint = document.getElementById('selection-mode-hint');
      if (active && !hint) {
        hint = document.createElement('div');
        hint.id = 'selection-mode-hint';
        hint.className = 'selection-mode-hint';
        hint.innerHTML = '<strong>まとめて追加モード</strong><span>追加したいイベントにチェックを入れてください。選択後、画面下のバーからまとめてカレンダーへ追加できます。</span>';
        const todayBody = document.getElementById('today-body');
        if (todayBody) todayBody.before(hint);
      } else if (!active && hint) {
        hint.remove();
      }
    };

    sync();
    btn.addEventListener('click', () => requestAnimationFrame(sync));
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

  function polishModalActions(ev) {
    const modal = document.getElementById('event-modal');
    if (!modal || !ev) return;
    const body = modal.querySelector('.modal-body');
    const detail = document.getElementById('modal-detail-content');
    const reactions = document.getElementById('modal-reactions');
    const desc = document.getElementById('modal-desc-section');
    const share = document.getElementById('modal-share-actions');
    const footer = document.getElementById('modal-footer-section');
    const regLink = document.getElementById('modal-reg-link');
    const extLink = document.getElementById('modal-ext-link');
    if (!body) return;

    let primary = modal.querySelector('.modal-primary-actions');
    if (!primary) {
      primary = document.createElement('div');
      primary.className = 'modal-primary-actions';
    }
    if (regLink) {
      regLink.textContent = '参加申し込み ↗';
      regLink.classList.remove('btn-sm');
      primary.appendChild(regLink);
    }
    if (extLink) {
      extLink.textContent = '公式情報を見る ↗';
      extLink.classList.remove('btn-sm');
      primary.appendChild(extLink);
    }
    const hasPrimary = [regLink, extLink].some(el => el && el.style.display !== 'none');
    primary.hidden = !hasPrimary;
    if (detail && detail.parentNode === body) detail.after(primary);
    else body.prepend(primary);

    if (desc && reactions && desc.parentNode === reactions.parentNode) {
      reactions.parentNode.insertBefore(desc, reactions);
    }

    if (share && typeof buildGoogleCalendarUrl === 'function') {
      const id = escapeHtml(String(ev.id));
      const mainShare = (typeof navigator !== 'undefined' && navigator.share && typeof shareEventViaWebShare === 'function')
        ? `<button type="button" class="btn btn-ghost btn-sm" onclick="shareEventViaWebShare('${id}')">📤 共有</button>`
        : `<button type="button" class="btn btn-ghost btn-sm" onclick="copyEventUrl('${id}', this)">🔗 リンクをコピー</button>`;
      const copyExtra = (typeof navigator !== 'undefined' && navigator.share)
        ? `<button type="button" class="btn btn-ghost btn-sm" onclick="copyEventUrl('${id}', this)">🔗 URLをコピー</button>`
        : '';
      share.innerHTML = `
        <div class="modal-quick-actions">
          <a class="btn btn-ghost btn-sm" href="${escapeHtml(buildGoogleCalendarUrl(ev))}" target="_blank" rel="noopener noreferrer" onclick="trackEvent('event_calendar_add', {event_id: '${id}'})">📅 カレンダーに追加</a>
          ${mainShare}
        </div>
        <details class="modal-more-actions">
          <summary>その他の操作</summary>
          <div class="modal-more-actions-grid">
            <button type="button" class="btn btn-ghost btn-sm" onclick="downloadIcsForEvent('${id}')">⬇️ .icsで保存</button>
            ${copyExtra}
            <button type="button" class="btn btn-ghost btn-sm" onclick="generatePostImageForEvent('${id}')">🖼️ 投稿用画像</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="shareEventOnLine('${id}')">LINEで共有</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="shareEventOnX('${id}')">Xで共有</button>
          </div>
        </details>`;
    }

    const footerLinks = footer?.querySelector('.modal-footer-links');
    if (footerLinks && footerLinks.children.length === 0) footerLinks.hidden = true;
  }

  function installModalActionPolish() {
    if (typeof window.openModal !== 'function' || window.__wcModalPolishInstalled) return;
    window.__wcModalPolishInstalled = true;
    const original = window.openModal;
    window.openModal = function openModalPolished(eventId) {
      original(eventId);
      const ev = eventsSafe().find(item => String(item.id) === String(eventId));
      if (ev) requestAnimationFrame(() => polishModalActions(ev));
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

  function compactDenseCalendar(root = document) {
    root.querySelectorAll('.calendar-day').forEach(day => {
      const chips = [...day.querySelectorAll('.day-event-chip')];
      const more = day.querySelector('.day-more');
      if (more) {
        const m = more.textContent.match(/(?:他|\+)(\d+)件/);
        let hidden = m ? Number(m[1]) : 0;
        if (chips.length > 2) {
          chips.slice(2).forEach(chip => chip.classList.add('calendar-chip-overflow'));
          hidden += chips.length - 2;
        }
        if (hidden > 0) more.textContent = `+${hidden}件`;
      }
    });
  }

  function watchCalendarEnhancements() {
    const targets = ['calendar-grid', 'calendar-list', 'long-running-events']
      .map(id => document.getElementById(id)).filter(Boolean);
    if (!targets.length) return;
    let queued = false;
    const run = () => {
      compactDenseCalendar(document);
      enhanceCalendarAria(document);
    };
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        run();
      });
    });
    targets.forEach(target => observer.observe(target, { childList: true, subtree: true }));
    run();
  }

  function polishContactForm() {
    const options = document.getElementById('entry-options');
    if (!options || options.dataset.polished === 'true') return;
    options.dataset.polished = 'true';

    const byValue = new Map([...options.querySelectorAll('.entry-option')].map(label => [label.querySelector('input')?.value, label]));
    const rename = (value, text) => {
      const label = byValue.get(value);
      const span = label?.querySelector('span');
      if (span) span.textContent = text;
    };
    rename('new-org', 'イベントを掲載したい（初回）');
    rename('returning-org', 'イベントを追加したい（登録済み団体）');
    rename('edit-delete', '掲載中のイベントを修正・削除');
    rename('org-info', '団体ページを登録・修正');

    const makeGroup = (title, desc, values) => {
      const group = document.createElement('div');
      group.className = 'contact-entry-group';
      group.innerHTML = `<div class="contact-entry-group-head"><strong>${title}</strong><span>${desc}</span></div>`;
      const choices = document.createElement('div');
      choices.className = 'contact-entry-choices';
      values.forEach(value => { const el = byValue.get(value); if (el) choices.appendChild(el); });
      group.appendChild(choices);
      return group;
    };

    options.innerHTML = '';
    options.appendChild(makeGroup('イベントを掲載する', '新しいイベントの掲載はこちら', ['new-org', 'returning-org']));
    options.appendChild(makeGroup('掲載内容を変更する', 'イベントや団体情報の修正はこちら', ['edit-delete', 'org-info']));

    const more = document.createElement('details');
    more.className = 'contact-entry-more';
    more.innerHTML = '<summary>その他のお問い合わせ</summary><div class="contact-entry-choices"></div>';
    const moreChoices = more.querySelector('.contact-entry-choices');
    ['sponsor', 'bug-report', 'other'].forEach(value => { const el = byValue.get(value); if (el) moreChoices.appendChild(el); });
    options.appendChild(more);

    const gcal = document.querySelector('.gcal-import-box');
    if (gcal && !gcal.closest('.contact-gcal-details')) {
      const details = document.createElement('details');
      details.className = 'contact-gcal-details';
      details.innerHTML = '<summary>Googleカレンダーから取り込む（任意）</summary>';
      gcal.parentNode.insertBefore(details, gcal);
      details.appendChild(gcal);
    }
  }

  onReady(() => {
    installTokyoDateConsistency();
    polishNavigation();
    polishSelectionControl();
    fixOrganizationEventHub();
    watchOrganizationEventHub();
    installMypagePolish();
    installUpcomingTemporalSort();
    installModalActionPolish();
    watchCalendarEnhancements();
    polishContactForm();

    if (document.getElementById('mypage-content') && window.WC?.currentUser && typeof renderMypageLoggedIn === 'function') {
      renderMypageLoggedIn();
    }
    if (document.getElementById('upcoming-events') && typeof renderAll === 'function') {
      try { renderAll(); } catch (_) {}
      requestAnimationFrame(() => {
        compactDenseCalendar(document);
        enhanceCalendarAria(document);
        polishSelectionControl();
      });
    }
  });
})();
