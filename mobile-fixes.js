/** Waseda Calendar mobile behavior hardening (2026-09) */
(() => {
  'use strict';

  const onReady = (fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };

  function syncMobileNavigationState() {
    const btn = document.getElementById('hamburger-btn');
    const nav = document.getElementById('mobile-nav');
    if (!btn || !nav) return;

    btn.setAttribute('aria-controls', nav.id || 'mobile-nav');
    const sync = () => btn.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(nav, { attributes: true, attributeFilter: ['class'] });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !nav.classList.contains('open')) return;
      nav.classList.remove('open');
      sync();
      btn.focus();
    });
  }

  /**
   * showDayEvents() reuses the event-detail modal. After a normal event was opened,
   * ux-polish moves registration/official links into .modal-primary-actions.
   * Without clearing that block, a later day-list modal can accidentally show the
   * previous event's CTA. Hide it whenever the modal is used as a multi-event list.
   */
  function preventStaleDayListActions() {
    if (typeof window.showDayEvents !== 'function' || window.__wcDayListFixInstalled) return;
    window.__wcDayListFixInstalled = true;
    const original = window.showDayEvents;

    window.showDayEvents = function showDayEventsMobileSafe(dateStr) {
      original(dateStr);
      const modal = document.getElementById('event-modal');
      if (!modal?.classList.contains('active')) return;

      const primary = modal.querySelector('.modal-primary-actions');
      if (primary) primary.hidden = true;

      const footerLinks = modal.querySelector('.modal-footer-links');
      if (footerLinks) footerLinks.hidden = true;
    };
  }

  onReady(() => {
    syncMobileNavigationState();
    preventStaleDayListActions();
  });
})();
