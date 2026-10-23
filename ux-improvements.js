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
        if (text.includes('今週開催') || text.includes('この先7日間')) { item.remove(); return; }
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
  function getHomeNowMinutes(){
    const d=new Date(Date.now()+32400000);
    return d.getUTCHours()*60+d.getUTCMinutes();
  }

  function getHomeTodayStatus(ev,today,now){
    if(getEventScope(ev)==='schedule')return {rank:3,label:''};
    if(isMultiDay(ev)){
      const day=Math.round((Date.parse(today+'T00:00:00Z')-Date.parse(ev.date+'T00:00:00Z'))/86400000)+1;
      return {rank:2,label:today===getEventEnd(ev)?'最終日':`${eventDurationDays(ev)}日間の${day}日目`};
    }
    const t=x=>/^\d{2}:\d{2}$/.test(x||'')?Number(x.slice(0,2))*60+Number(x.slice(3)):null;
    const start=t(ev.startTime),end=t(ev.endTime);
    if(start===null)return {rank:3,label:'時刻未定'};
    if(start>now)return {rank:1,label:start-now<=60?`まもなく ${ev.startTime}`:`このあと ${ev.startTime}`};
    if(end===null)return {rank:4,label:`${ev.startTime}開始`};
    if(end>now)return {rank:0,label:`開催中 〜${ev.endTime}`};
    return {rank:5,label:'本日終了'};
  }


  /** Hide expired single-day cards only from the homepage today list.
   * Multi-day opening hours and academic schedules are not assumed to be day-specific.
   */
  function isHomeTodayAvailable(ev, nowMinutes) {
    if (getEventScope(ev) === 'schedule' || isMultiDay(ev)) return true;
    const minutes = value => {
      if (!/^\d{2}:\d{2}$/.test(value || '')) return null;
      const [h, m] = value.split(':').map(Number);
      return h < 24 && m < 60 ? h * 60 + m : null;
    };
    const end = minutes(ev.endTime);
    const start = minutes(ev.startTime);
    // Where an end time exists, still let users discover a live event after its start.
    // Without an end time, do not assume it is still joinable after the start.
    const cutoff = end === null ? start : end;
    return cutoff === null || nowMinutes < cutoff;
  }

  function classifyHomeEvents(events,today,now,scopeValue=''){
    const todayEvents=[],longRunning=[],upcoming=[];
    const from=addDaysToDateStr(today,1),through=addDaysToDateStr(today,7);
    for(const ev of events){
      if(!ev||!ev.isPublished)continue;
      const schedule=getEventScope(ev)==='schedule';
      if(scopeValue==='schedule'?!schedule:schedule)continue;
      if(!schedule&&isLongRunningEvent(ev)){
        if(isEventOnDate(ev,today))longRunning.push(ev);
        continue;
      }
      if(isEventOnDate(ev,today) && isHomeTodayAvailable(ev,now))todayEvents.push(ev);
      // The tests for today and tomorrow are independent: short multi-day events may overlap.
      for(let day=1;day<=7;day++){
        const date=addDaysToDateStr(today,day);
        if(isEventOnDate(ev,date)){upcoming.push({ev,displayDate:date});break;}
      }
    }
    todayEvents.sort((a,b)=>{
      const aa=getHomeTodayStatus(a,today,now),bb=getHomeTodayStatus(b,today,now);
      return aa.rank-bb.rank
        ||String(a.startTime||'99:99').localeCompare(String(b.startTime||'99:99'))
        ||(typeof sameDayOrderCompare==='function'?sameDayOrderCompare(a,b,today):0);
    });
    longRunning.sort((a,b)=>getEventEnd(a).localeCompare(getEventEnd(b))||a.date.localeCompare(b.date));
    upcoming.sort((a,b)=>a.displayDate.localeCompare(b.displayDate)
      ||String(a.ev.startTime||'99:99').localeCompare(String(b.ev.startTime||'99:99'))
      ||(typeof sameDayOrderCompare==='function'?sameDayOrderCompare(a.ev,b.ev,today):0));
    return {todayEvents,longRunning,upcoming,from,through};
  }

  function homeClassification(source){
    return classifyHomeEvents(source||getFilteredEvents(),getTodayStr(),getHomeNowMinutes(),activeFilters.scope||'');
  }

  // スマホ版v2（mobile-home.js）が同じ判定を使えるよう、読み取り専用で公開する（関数は上書きしない）。
  WC_UX.home = Object.freeze({ getHomeNowMinutes, getHomeTodayStatus, isHomeTodayAvailable, classifyHomeEvents });

  function homeTodayCard(ev,today,now){
    const status=getHomeTodayStatus(ev,today,now);
    const html=createEventCardHTML(ev,false);
    if(!status.label)return html;
    return html.replace('<div class="event-card-meta">',`<div class="event-card-meta"><span class="tag home-status home-status-${status.rank}">${escapeHtml(status.label)}</span>`);
  }

  function updateHomeHero(source){
    const el=document.querySelector('.hero-live-count');if(!el)return;
    const model=homeClassification(source);
    el.innerHTML=(activeFilters.scope||'')==='schedule'
      ?`今日は <strong>${model.todayEvents.length}件</strong> の学事日程があります。`
      :`今日は <strong>${model.todayEvents.length}件</strong> のイベント・会期中の展示や企画 <strong>${model.longRunning.length}件</strong>`;
  }

  function installHomeRenderOverrides() {
    if (typeof window.renderTodayEvents === 'function') window.renderTodayEvents = function renderTodayEventsUx(allFiltered){
  const el=document.getElementById('today-events');if(!el)return [];
  const source=allFiltered||getFilteredEvents(),model=homeClassification(source);
  const today=getTodayStr(),now=getHomeNowMinutes();
  const count=document.getElementById('today-count');if(count)count.textContent=`${model.todayEvents.length}件`;
  el.innerHTML=model.todayEvents.length
    ?eventsGridWithShowMoreHTML(model.todayEvents.map(ev=>homeTodayCard(ev,today,now)).join(''),'today-events')
    :`<div class="empty-state"><div class="empty-state-icon">📭</div><p>${(activeFilters.scope||'')==='schedule'?'本日の学事日程はありません。':'本日のイベントは0件です。'}</p><p class="empty-state-action"><button type="button" class="btn btn-ghost btn-sm" onclick="scrollToSection('upcoming-section')">明日から7日間を見る</button></p></div>`;
  renderHomeLongRunning(model.longRunning);
  updateHomeHero(source);
  return model.todayEvents.map(ev=>ev.id);
};
    if (typeof window.renderUpcomingEvents === 'function') window.renderUpcomingEvents = function renderUpcomingEventsUx(allFiltered){
  const el=document.getElementById('upcoming-events');if(!el)return [];
  const model=homeClassification(allFiltered||getFilteredEvents());
  document.getElementById('upcoming-long-running')?.remove();
  const count=document.getElementById('upcoming-count');if(count)count.textContent=`${model.upcoming.length}件`;
  el.dataset.homeGrouped='true';
  if(!model.upcoming.length){el.innerHTML=emptyStateHTML('明日から7日間の予定は0件です。');return [];}
  const firstDay=model.upcoming.filter(item=>item.displayDate===model.from);
  const following=model.upcoming.filter(item=>item.displayDate!==model.from);
  const initial=[...firstDay.slice(0,3)];
  initial.push(...following.slice(0,Math.max(0,5-initial.length)));
  const shown=new Set(initial.map(x=>String(x.ev.id)));
  const groups=new Map();
  for(const item of model.upcoming){
    if(!groups.has(item.displayDate))groups.set(item.displayDate,[]);
    groups.get(item.displayDate).push(item);
  }
  const parts=[];
  for(const [date,items] of groups){
    const hasVisible=items.some(x=>shown.has(String(x.ev.id)));
    parts.push(`<div class="home-upcoming-day-heading home-upcoming-extra" data-date="${date}"${hasVisible?'':' hidden'}><span>${escapeHtml(formatDateDisplay(date))}</span><span>${items.length}件</span></div>`);
    for(const item of items){
      let html=createEventCardHTML(item.ev,true);
      if(!shown.has(String(item.ev.id)))html=html.replace('class="event-card"','class="event-card home-upcoming-extra" hidden');
      parts.push(html);
    }
  }
  const hiddenCount=model.upcoming.length-shown.size;
  el.innerHTML=`<div class="events-grid home-upcoming-grid">${parts.join('')}</div>${hiddenCount?`<div class="home-upcoming-more-wrap"><button type="button" class="home-upcoming-more" aria-expanded="false">すべて見る（他${hiddenCount}件）</button></div>`:''}`;
  el.querySelector('.home-upcoming-more')?.addEventListener('click',e=>{
    const btn=e.currentTarget,expanded=btn.getAttribute('aria-expanded')==='true';
    el.querySelectorAll('.home-upcoming-extra').forEach(node=>{
      if(!expanded){node.hidden=false;return;}
      if(node.classList.contains('home-upcoming-day-heading'))node.hidden=!(groups.get(node.dataset.date)||[]).some(x=>shown.has(String(x.ev.id)));
      else node.hidden=!shown.has(String(node.dataset.id));
    });
    btn.setAttribute('aria-expanded',String(!expanded));
    btn.textContent=expanded?`すべて見る（他${hiddenCount}件）`:'閉じる';
    if(!expanded&&typeof refreshLiveReactionCounts==='function')refreshLiveReactionCounts(model.upcoming.map(x=>x.ev.id));
  });
  if(!model.todayEvents.length){
    const body=document.getElementById('upcoming-body'),toggle=document.getElementById('upcoming-toggle');
    if(body&&toggle&&body.hidden){body.hidden=false;toggle.setAttribute('aria-expanded','true');}
  }
  return model.upcoming.map(x=>x.ev.id);
};

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

  function renderHomeLongRunning(events){
    const today=document.getElementById('today-events');if(!today)return;
    let box=document.getElementById('home-long-running');
    if(!events.length){box?.remove();return;}
    if(!box){box=document.createElement('aside');box.id='home-long-running';box.className='home-long-running';box.setAttribute('aria-label','会期中の展示・長期企画');today.after(box);}
    const visible=window.matchMedia('(max-width: 768px)').matches?1:2;
    const rows=events.map(ev=>{
      const remaining=Math.round((Date.parse(getEventEnd(ev)+'T00:00:00Z')-Date.parse(getTodayStr()+'T00:00:00Z'))/86400000);
      return `<button type="button" class="home-long-item" onclick="openModal('${escapeHtml(String(ev.id))}')"><span class="home-long-item-title">${escapeHtml(ev.title)}</span><span class="home-long-item-date">〜${escapeHtml(formatShortDate(getEventEnd(ev)))}</span>${remaining>=0&&remaining<=7?'<span class="home-long-soon">まもなく終了</span>':''}</button>`;
    });
    const extra=Math.max(0,events.length-visible);
    box.innerHTML=`<h3>🖼 会期中の展示・長期企画 <span class="home-long-count">${events.length}件</span></h3>
      <div class="home-long-list">${rows.slice(0,visible).join('')}</div>
      ${extra?`<div class="home-long-extra" id="home-long-extra" hidden>${rows.slice(visible).join('')}</div>
        <button type="button" class="home-long-toggle" aria-expanded="false" aria-controls="home-long-extra">ほか${extra}件を見る ▸</button>`:''}
      <p class="home-long-note">会期内の企画です。開館日・休館日は公式情報をご確認ください。</p>`;
    const toggle=box.querySelector('.home-long-toggle');
    toggle?.addEventListener('click',()=>{
      const open=toggle.getAttribute('aria-expanded')==='true';
      box.querySelector('#home-long-extra').hidden=open;
      toggle.setAttribute('aria-expanded',String(!open));
      toggle.textContent=open?`ほか${extra}件を見る ▸`:'閉じる';
    });
  }

  function homeDomEnhancements() {
    if (!document.querySelector('.hero')) return;
    const heroCtas = document.querySelectorAll('.hero-cta > *');
    if (heroCtas[0]) heroCtas[0].textContent = '📅 今日行けるイベントを見る';
    if (heroCtas[1]) heroCtas[1].textContent = '🗓 カレンダーから探す';
    if (heroCtas[2] && heroCtas[2].getAttribute('href') === 'contact.html') heroCtas[2].remove();

    const heroSub = document.querySelector('.hero-sub');
    if (heroSub && !document.querySelector('.hero-live-count')) {
      const p = document.createElement('p'); p.className = 'hero-live-count'; heroSub.after(p);
    }
    if (typeof getFilteredEvents === 'function') updateHomeHero(getFilteredEvents());

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
      if (title) title.innerHTML = '今日、何する？<span class="beta-badge">β</span>';
      if (desc) desc.textContent = '3つの質問で、条件に合うイベントを3件選びます';
      if (cta && cta.firstChild) cta.firstChild.textContent = '3問で選ぶ ';
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
        if (!ev.location && row.textContent.trim().startsWith('📍')) row.remove();
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
        // Show old saved IDs under the canonical card; do not change stored Firestore data.
        getAllEventsSafe().filter(ev => ev.mergedInto).forEach(ev => {
          if (favoriteMap.has(String(ev.id)) && !favoriteMap.has(String(ev.mergedInto)))
            favoriteMap.set(String(ev.mergedInto), favoriteMap.get(String(ev.id)));
        });
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


  /** Refresh on meaningful clock boundaries, not a costly full-calendar redraw every 30s. */
  function installHomeClockRefresh() {
    if (!document.getElementById('today-events') || WC_UX.homeClockRefreshInstalled) return;
    WC_UX.homeClockRefreshInstalled = true;
    let lastDate = getTodayStr();

    const snapshot = source => {
      const date = getTodayStr(), now = getHomeNowMinutes();
      return classifyHomeEvents(source, date, now, activeFilters.scope || '').todayEvents
        .map(ev => String(ev.id) + ':' + getHomeTodayStatus(ev, date, now).label).join('|');
    };
    let last = snapshot(getFilteredEvents());

    const update = () => {
      if (document.hidden) return;
      const date = getTodayStr();
      if (lastDate !== date) {
        lastDate = date;
        renderAll(); // At midnight also update tomorrow's week and the month calendar.
        last = snapshot(getFilteredEvents());
        return;
      }
      const source = getFilteredEvents();
      const next = snapshot(source);
      if (next === last) return;

      const container = document.getElementById('today-events');
      const section = document.getElementById('today-section');
      const expanded = container?.querySelector('.events-grid')?.dataset.expanded === 'true';
      const ids = renderTodayEvents(source);

      const grid = container?.querySelector('.events-grid');
      if (grid && expanded) {
        grid.dataset.expanded = 'true';
        const button = container.querySelector('.show-more-btn');
        if (button) {
          button.style.display = '';
          button.dataset.action = 'collapse';
          button.textContent = '閉じる';
        }
      } else if (grid) {
        requestAnimationFrame(() => collapseGridToOneRow(container));
      }

      if (!ids.length) {
        const body = document.getElementById('upcoming-body');
        const toggle = document.getElementById('upcoming-toggle');
        if (body?.hidden && toggle) {
          body.hidden = false;
          toggle.setAttribute('aria-expanded', 'true');
          requestAnimationFrame(() => collapseGridToOneRow(document.getElementById('upcoming-events')));
        }
      }
      requestAnimationFrame(() => {
        if (typeof refreshLiveReactionCounts === 'function' && typeof getInitiallyVisibleCardIds === 'function') {
          refreshLiveReactionCounts(getInitiallyVisibleCardIds('today-events'));
        }
      });
      last = next;
    };

    window.setInterval(update, 30000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('pageshow', update);
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
      installHomeClockRefresh();
    }
  });
})();
