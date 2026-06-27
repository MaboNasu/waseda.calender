/**
 * status.js - 申請ステータス確認ページ
 * orgId + token をGAS側に問い合わせ、紐づく申請一覧を表示する。
 */
const STATUS_GAS_URL = 'https://script.google.com/macros/s/AKfycbyLKb-Dh8EfwYmiKwbGg-8t8ptVA7bczf5yOwQCHKuUPDOoOseom3uX9pBFNEt3QE-o/exec';

function statusEscapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function statusBadgeClass(status) {
  if (status === '掲載済み') return 'status-badge status-badge-published';
  if (status === '却下') return 'status-badge status-badge-rejected';
  return 'status-badge status-badge-pending';
}

function renderStatusError(message) {
  const result = document.getElementById('status-result');
  if (!result) return;
  result.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">🔒</div>
      <p>${statusEscapeHtml(message)}</p>
    </div>`;
  // 照会に失敗した場合は手入力で再試行できるようフォームを再表示する
  const form = document.getElementById('status-auth-form');
  if (form) form.style.display = '';
}

function renderStatusResult(data) {
  const result = document.getElementById('status-result');
  if (!result) return;

  if (!data.success) {
    renderStatusError('団体IDまたはトークンが正しくありません。確認メールに記載のURLからアクセスしてください。');
    return;
  }

  const inquiries = data.inquiries || [];
  const orgName = data.org && data.org.name ? data.org.name : '';

  if (inquiries.length === 0) {
    result.innerHTML = `
      <p class="status-org-name">${statusEscapeHtml(orgName)} 様の申請一覧</p>
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <p>これまでの申請はまだありません。</p>
      </div>`;
    return;
  }

  result.innerHTML = `
    <p class="status-org-name">${statusEscapeHtml(orgName)} 様の申請一覧（${inquiries.length}件）</p>
    <div class="status-list">
      ${inquiries.map(item => `
        <article class="status-card">
          <div class="status-card-head">
            <span class="${statusBadgeClass(item.status)}">${statusEscapeHtml(item.status)}</span>
            <span class="status-receipt">受付番号: ${statusEscapeHtml(item.receiptNumber)}</span>
          </div>
          <h3 class="status-event-name">${statusEscapeHtml(item.eventName || '（イベント名未指定）')}</h3>
          <p class="status-event-date">📅 ${statusEscapeHtml(item.eventDate || '（指定なし）')}</p>
          ${item.status === '却下' && item.memo ? `<p class="status-memo">却下理由: ${statusEscapeHtml(item.memo)}</p>` : ''}
        </article>`).join('')}
    </div>`;
}

async function fetchInquiryStatus(orgId, token) {
  const result = document.getElementById('status-result');
  if (result) {
    result.innerHTML = `<div class="empty-state"><p>確認中...</p></div>`;
  }
  try {
    const url = `${STATUS_GAS_URL}?action=myInquiries&orgId=${encodeURIComponent(orgId)}&token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const data = await res.json();
    renderStatusResult(data);
  } catch (err) {
    renderStatusError('通信エラーが発生しました。時間をおいて再度お試しください。');
  }
}

function setupStatusForm() {
  const btn = document.getElementById('status-lookup-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      const orgId = document.getElementById('status-org-id').value.trim();
      const token = document.getElementById('status-org-token').value.trim();
      if (!orgId || !token) {
        renderStatusError('団体IDとトークンの両方を入力してください。');
        return;
      }
      fetchInquiryStatus(orgId, token);
    });
  }
}

function setupStatusNav() {
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const nav = document.getElementById('mobile-nav');
  if (!hamburgerBtn || !nav) return;

  hamburgerBtn.addEventListener('click', () => {
    nav.classList.toggle('open');
    hamburgerBtn.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
  });

  document.addEventListener('click', (e) => {
    if (!hamburgerBtn.contains(e.target) && !nav.contains(e.target)) {
      nav.classList.remove('open');
      hamburgerBtn.setAttribute('aria-expanded', 'false');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupStatusNav();
  setupStatusForm();

  const params = new URLSearchParams(window.location.search);
  const urlOrgId = params.get('orgId');
  const urlToken = params.get('token');

  if (urlOrgId && urlToken) {
    document.getElementById('status-org-id').value = urlOrgId;
    document.getElementById('status-org-token').value = urlToken;
    document.getElementById('status-auth-form').style.display = 'none';
    fetchInquiryStatus(urlOrgId, urlToken);
  }
});
